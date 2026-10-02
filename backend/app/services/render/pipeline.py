"""Render a creation to MP4 with ffmpeg, in three passes:

1. Each segment (a moment or a text card) becomes a normalised clip: the output size at
   30 fps with 48 kHz stereo audio, framed for the template's layout.
2. The clips are joined: a stream copy for cuts, xfade/acrossfade for crossfades and slides.
3. The final pass burns in captions and text (ASS via libass, bundled fonts), overlays the
   logo, mixes in music ducked under speech, normalises loudness to about -14 LUFS, and
   encodes H.264/AAC with faststart.

Everything here is synchronous and runs in a worker thread; ``progress(fraction, step)``
reports overall progress from 0 to 1. Inputs are local files; downloading and uploading belong to the caller.
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from app.services.render.ass import build_ass
from app.services.render.layout import Box, crop_window, output_size, video_box
from app.services.render.timeline import Segment, Timeline, build_timeline

logger = logging.getLogger(__name__)

FONTS_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "fonts"
FPS = 30
SEGMENT_TIMEOUT = 15 * 60
FINAL_TIMEOUT = 40 * 60

Progress = Callable[[float, str], None]


class RenderError(Exception):
    """A render failed for a reason the user can act on; the message is shown to them."""


@dataclass
class Source:
    path: str
    width: int
    height: int
    duration: float
    has_audio: bool


def probe(path: str) -> Source:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RenderError("One of the source videos couldn't be read.")
    data = json.loads(out.stdout or "{}")
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video:
        raise RenderError("One of the source videos has no picture.")
    width, height = int(video["width"]), int(video["height"])
    rotation = 0
    for side in video.get("side_data_list", []) or []:
        if "rotation" in side:
            rotation = int(side["rotation"])
    rotation = rotation or int((video.get("tags") or {}).get("rotate", 0) or 0)
    if abs(rotation) % 180 == 90:  # ffmpeg auto-rotates, so frames come out turned
        width, height = height, width
    duration = float((data.get("format") or {}).get("duration") or video.get("duration") or 0)
    return Source(path, width, height, duration, any(s.get("codec_type") == "audio" for s in streams))


def probe_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, timeout=60,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def _run(cmd: list[str], timeout: int, cwd: Path, on_time: Callable[[float], None] | None = None) -> None:
    """Run ffmpeg; with ``on_time``, parse -progress output to report seconds encoded."""
    logger.debug("ffmpeg: %s", " ".join(cmd))
    if on_time is None:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        if result.returncode != 0:
            logger.error("ffmpeg failed: %s", result.stderr[-3000:])
            raise RenderError("The video couldn't be rendered.")
        return
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=cwd)
    try:
        import threading

        err: list[str] = []
        reader = threading.Thread(target=lambda: err.append(proc.stderr.read()), daemon=True)
        reader.start()
        for line in proc.stdout:
            if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                try:
                    on_time(int(line.split("=", 1)[1]) / 1_000_000)
                except ValueError:
                    pass
        proc.wait(timeout=timeout)
        reader.join(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RenderError("Rendering took too long. Try a shorter creation.")
    if proc.returncode != 0:
        logger.error("ffmpeg failed: %s", "".join(err)[-3000:])
        raise RenderError("The video couldn't be rendered.")


def _hex(color: str) -> str:
    return "0x" + color.lstrip("#")[:6]


def _rounded_mask(path: Path, w: int, h: int, radius: int, cwd: Path) -> None:
    r = max(1, min(radius, w // 2, h // 2))
    expr = (
        f"if(lte(pow(max(abs(X-W/2)-(W/2-{r})\\,0)\\,2)+pow(max(abs(Y-H/2)-(H/2-{r})\\,0)\\,2)\\,{r * r})\\,255\\,0)"
    )
    _run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=white:s={w}x{h}",
          "-frames:v", "1", "-vf", f"format=gray,geq=lum='{expr}'", str(path)], 120, cwd)


class Renderer:
    def __init__(self, spec: dict, sources: dict[str, Source], workdir: Path,
                 music_path: str | None = None, logo_path: str | None = None,
                 progress: Progress | None = None):
        self.spec = spec
        self.recipe = spec["recipe"]
        self.settings = spec["settings"]
        self.sources = sources
        self.work = workdir
        self.music_path = music_path
        self.logo_path = logo_path
        self.progress = progress or (lambda f, s: None)
        self.width, self.height = output_size(self.settings["format"], int(spec["resolution"]))
        self.layout = self.recipe.get("layout") or {}
        self.box = video_box(self.layout, self.width, self.height)
        self.brand = self.settings.get("branding") or {}
        self.timeline: Timeline = build_timeline(self.recipe, self.settings, spec["moments"], spec.get("captions"))
        self.mask: Path | None = None

    # ------------------------------------------------------------------ pass 1
    def _background(self, seg: Segment, src_label: str | None) -> tuple[str, str]:
        """Filter producing the full-frame background for a segment, and its label."""
        w, h, d = self.width, self.height, seg.duration
        if (seg.background == "blur" or self.settings.get("background") == "blur") and src_label:
            return (
                f"[{src_label}]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
                f"gblur=sigma={max(12, w // 30)},eq=brightness=-0.12,setsar=1[bg]",
                "bg",
            )
        panel = self.layout.get("panel_background") or self.layout.get("background") or "brand.primary"
        color = self.brand.get("accent") if panel == "brand.accent" else self.brand.get("primary", "#111827")
        return f"color=c={_hex(color)}:s={w}x{h}:r={FPS}:d={d:.3f}[bg]", "bg"

    def _moment_video(self, seg: Segment, src: Source) -> str:
        """Filtergraph for a moment's picture, ending in [v]."""
        m = seg.moment
        crop = m.get("crop")
        box = self.box
        fit = crop is None and self.layout.get("reframe") == "none"
        kind = self.layout.get("type", "fill")
        graph: list[str] = []
        if kind == "fill" and not fit:
            c = crop or {}
            win = crop_window(src.width, src.height, box.aspect, c.get("x", 0.5), c.get("y", 0.5), c.get("zoom", 1.0))
            graph.append(f"[0:v]crop={win.w}:{win.h}:{win.x}:{win.y},scale={box.w}:{box.h},setsar=1[fg]")
            graph.append(f"[fg]fps={FPS},format=yuv420p[v]")
            return ";".join(graph)

        graph.append("[0:v]split=2[src][srcbg]")
        bg, bg_label = self._background(seg, "srcbg")
        if not bg.startswith("[srcbg]"):
            graph.append("[srcbg]nullsink")
        graph.append(bg)
        if fit:
            graph.append(f"[src]scale={box.w}:{box.h}:force_original_aspect_ratio=decrease,setsar=1[fg]")
            x = f"{box.x}+({box.w}-overlay_w)/2"
            y = f"{box.y}+({box.h}-overlay_h)/2"
        else:
            c = crop or {}
            win = crop_window(src.width, src.height, box.aspect, c.get("x", 0.5), c.get("y", 0.5), c.get("zoom", 1.0))
            graph.append(f"[src]crop={win.w}:{win.h}:{win.x}:{win.y},scale={box.w}:{box.h},setsar=1[fg]")
            x, y = str(box.x), str(box.y)
        if kind == "frame" and self.mask is not None:
            graph.append(f"movie={self.mask.name},format=gray,loop=-1:1:0[mask]")
            graph.append("[fg]format=yuva420p[fga];[fga][mask]alphamerge[fgr]")
            fg = "fgr"
        else:
            fg = "fg"
        graph.append(f"[{bg_label}][{fg}]overlay=x={x}:y={y}:shortest=1,fps={FPS},format=yuv420p[v]")
        return ";".join(graph)

    def _segment(self, i: int, seg: Segment) -> Path:
        out = self.work / f"seg_{i:03d}.mp4"
        d = seg.duration
        cmd = ["ffmpeg", "-y", "-v", "error"]
        if seg.kind == "moment":
            m = seg.moment
            src = self.sources[str(m["video_id"])]
            cmd += ["-ss", f"{float(m['start']):.3f}", "-t", f"{d:.3f}", "-i", src.path]
            graph = self._moment_video(seg, src)
            use_audio = src.has_audio and m.get("keep_audio", True)
        else:
            first = self.timeline.moments[0].moment if self.timeline.moments else None
            blur = seg.background == "blur" and first is not None
            if blur:
                src = self.sources[str(first["video_id"])]
                cmd += ["-ss", f"{float(first['start']):.3f}", "-t", f"{d:.3f}", "-i", src.path]
                bg, _ = self._background(seg, "0:v")
            else:
                cmd += ["-f", "lavfi", "-t", f"{d:.3f}", "-i", f"color=c=black:s=16x16:r={FPS}"]
                bg, _ = self._background(Segment("card", d), None)
                bg = "[0:v]nullsink;" + bg
            graph = bg + f";[bg]fps={FPS},format=yuv420p[v]"
            use_audio = False
        cmd += ["-f", "lavfi", "-t", f"{d:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        if use_audio:
            graph += (
                f";[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{d:.3f},"
                "asetpts=PTS-STARTPTS[a];[1:a]anullsink"
            )
        else:
            graph += ";[1:a]anull[a]"
        cmd += [
            "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", f"{d:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", str(FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", str(out),
        ]
        _run(cmd, SEGMENT_TIMEOUT, self.work)
        return out

    # ------------------------------------------------------------------ pass 2
    def _join(self, parts: list[Path]) -> Path:
        out = self.work / "joined.mp4"
        tl = self.timeline
        if len(parts) == 1:
            return parts[0]
        if tl.transition == "cut":
            listing = self.work / "parts.txt"
            listing.write_text("".join(f"file '{p.name}'\n" for p in parts))
            _run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listing.name,
                  "-c", "copy", out.name], SEGMENT_TIMEOUT, self.work)
            return out
        kind = "slideleft" if tl.transition == "slide" else "fade"
        t = tl.transition_duration
        cmd = ["ffmpeg", "-y", "-v", "error"]
        for p in parts:
            cmd += ["-i", p.name]
        graph, v_prev, a_prev = [], "0:v", "0:a"
        for k in range(1, len(parts)):
            v_out, a_out = f"v{k}", f"a{k}"
            offset = tl.segments[k].start
            graph.append(f"[{v_prev}][{k}:v]xfade=transition={kind}:duration={t:.3f}:offset={offset:.3f}[{v_out}]")
            graph.append(f"[{a_prev}][{k}:a]acrossfade=d={t:.3f}[{a_out}]")
            v_prev, a_prev = v_out, a_out
        cmd += ["-filter_complex", ";".join(graph), "-map", f"[{v_prev}]", "-map", f"[{a_prev}]",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k", out.name]
        _run(cmd, FINAL_TIMEOUT, self.work)
        return out

    # ------------------------------------------------------------------ pass 3
    def _logo_position(self) -> tuple[str, str]:
        m = int(self.width * 0.05)
        pos = self.brand.get("logo_position", "top-right")
        box = self.box
        return {
            "top-left": (f"{m}", f"{m}"),
            "top-right": (f"main_w-overlay_w-{m}", f"{m}"),
            "bottom-left": (f"{m}", f"main_h-overlay_h-{m}"),
            "bottom-right": (f"main_w-overlay_w-{m}", f"main_h-overlay_h-{m}"),
            "center-bottom": ("(main_w-overlay_w)/2", f"main_h-overlay_h-{int(m * 1.5)}"),
            "frame-top-left": (f"{box.x}", f"max(0\\,({box.y}-overlay_h)/2)") if self.layout.get("type") == "frame"
            else (f"{m}", f"{m}"),
            "panel-bottom-right": (f"main_w-overlay_w-{m}", f"main_h-overlay_h-{m}"),
        }.get(pos, (f"main_w-overlay_w-{m}", f"{m}"))

    def _final(self, joined: Path, caption_style: dict, watermark: bool, on_time: Callable[[float], None]) -> Path:
        out = self.work / "output.mp4"
        tl = self.timeline
        (self.work / "subs.ass").write_text(
            build_ass(tl, self.recipe, self.settings, caption_style, self.width, self.height, self.box, watermark),
            encoding="utf-8",
        )
        cmd = ["ffmpeg", "-y", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", joined.name]
        graph = [f"[0:v]ass=subs.ass:fontsdir={FONTS_DIR}[vs]"]
        v_label, next_input = "vs", 1
        if self.logo_path and self.brand.get("logo_enabled"):
            cmd += ["-i", self.logo_path]
            lw = max(16, int(self.width * float(self.brand.get("logo_size", 0.16))) // 2 * 2)
            op = float(self.brand.get("logo_opacity", 0.9))
            x, y = self._logo_position()
            graph.append(f"[{next_input}:v]scale={lw}:-1,format=rgba,colorchannelmixer=aa={op:.2f}[logo]")
            graph.append(f"[vs][logo]overlay=x={x}:y={y}:format=auto[vl]")
            v_label, next_input = "vl", next_input + 1
        graph.append(f"[{v_label}]format=yuv420p[vout]")

        music = self.settings.get("music") or {}
        orig_vol = float(music.get("original_audio_volume", 1.0))
        graph.append(f"[0:a]volume={orig_vol:.3f}[orig]")
        audio = "orig"
        if self.music_path:
            cmd += ["-stream_loop", "-1", "-ss", f"{float(music.get('start_offset', 0)):.3f}", "-i", self.music_path]
            d = tl.duration
            fi = min(float(music.get("fade_in", 0)), d / 2)
            fo = min(float(music.get("fade_out", 0)), d / 2)
            chain = (f"[{next_input}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{d:.3f},"
                     f"asetpts=PTS-STARTPTS,volume={float(music.get('volume', 0.3)):.3f}")
            if fi > 0:
                chain += f",afade=t=in:st=0:d={fi:.2f}"
            if fo > 0:
                chain += f",afade=t=out:st={max(0.0, d - fo):.2f}:d={fo:.2f}"
            graph.append(chain + "[mus]")
            if music.get("ducking", True) and orig_vol > 0:
                graph.append("[orig]asplit=2[speech][key]")
                graph.append("[mus][key]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=400[duck]")
                graph.append("[speech][duck]amix=inputs=2:duration=first:normalize=0[mix]")
            else:
                graph.append("[orig][mus]amix=inputs=2:duration=first:normalize=0[mix]")
            audio = "mix"
        graph.append(f"[{audio}]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")

        cmd += [
            "-filter_complex", ";".join(graph), "-map", "[vout]", "-map", "[aout]", "-t", f"{tl.duration:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-r", str(FPS), "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", out.name,
        ]
        _run(cmd, FINAL_TIMEOUT, self.work, on_time=on_time)
        return out

    def thumbnail(self, video: Path) -> Path | None:
        thumb = self.work / "thumbnail.jpg"
        moments = self.timeline.moments
        at = (moments[0].start + min(1.0, moments[0].duration / 2)) if moments else 0.5
        try:
            _run(["ffmpeg", "-y", "-v", "error", "-ss", f"{at:.2f}", "-i", video.name, "-frames:v", "1",
                  "-vf", "scale='min(720,iw)':-2", "-q:v", "3", thumb.name], 60, self.work)
            return thumb
        except RenderError:
            return None

    # ------------------------------------------------------------------ run
    def run(self, caption_style: dict, watermark: bool) -> Path:
        tl = self.timeline
        if not tl.moments:
            raise RenderError("Add at least one moment before rendering.")
        if self.layout.get("type") == "frame":
            radius = int(float(self.layout.get("corner_radius", 0)) * min(self.width, self.height) / 1080)
            if radius > 0:
                self.mask = self.work / "mask.png"
                _rounded_mask(self.mask, self.box.w, self.box.h, radius, self.work)

        # Overall progress: framing segments 0-45%, joining 45-55%, final encode 55-100%.
        parts = []
        for i, seg in enumerate(tl.segments):
            self.progress(0.45 * i / len(tl.segments), "Framing moments")
            parts.append(self._segment(i, seg))
        self.progress(0.45, "Joining moments")
        joined = self._join(parts)
        self.progress(0.55, "Adding text and music")
        total = max(0.1, tl.duration)
        return self._final(joined, caption_style, watermark,
                           lambda t: self.progress(0.55 + 0.45 * min(1.0, t / total), "Encoding"))
