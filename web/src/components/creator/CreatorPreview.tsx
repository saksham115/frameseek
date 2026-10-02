import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Move, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { CaptionLine, CaptionStyle, CreationSettings, Crop, Moment, TemplateRecipe } from "@/api/creations";
import type { Video } from "@/api/types";
import {
  anchorFor,
  boxAspect,
  buildTimeline,
  contrastText,
  cropWindow,
  familyFace,
  fontCss,
  formatAspect,
  resolveColor,
  segmentAt,
  TEXT_SIZES,
  videoBox,
  wordTimes,
  type Anchor,
  type Segment,
} from "@/lib/creator";
import { formatClipTime } from "@/lib/clip-time";
import { cn } from "@/lib/utils";

interface Props {
  recipe: TemplateRecipe;
  settings: CreationSettings;
  moments: Moment[];
  captions: Record<string, CaptionLine[]>;
  captionStyle: CaptionStyle | undefined;
  videos: Record<string, Video | undefined>;
  logoUrl: string | null;
  musicUrl: string | null;
  watermark: boolean;
  selectedMomentId: string | null;
  onSelectMoment: (id: string) => void;
  onCropChange: (id: string, crop: Crop) => void;
}

function anchorStyle(a: Anchor, stageW: number, stageH: number): CSSProperties {
  const tx = a.align === "center" ? "-50%" : a.align === "right" ? "-100%" : "0";
  const ty = a.valign === "middle" ? "-50%" : a.valign === "bottom" ? "-100%" : "0";
  return {
    position: "absolute",
    left: a.x * stageW,
    top: a.y * stageH,
    transform: `translate(${tx}, ${ty})`,
    textAlign: a.align,
    // Size to the text (not to the space left of the anchor), up to the safe width.
    width: "max-content",
    maxWidth: stageW * (a.align === "center" ? 0.88 : 0.82),
  };
}

function chunkCaption(text: string, start: number, end: number, maxChars: number) {
  const chunks: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const cand = `${cur} ${word}`.trim();
    if (cur && cand.length > maxChars) {
      chunks.push(cur);
      cur = word;
    } else cur = cand;
  }
  if (cur) chunks.push(cur);
  const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
  let cursor = start;
  return chunks.map((c) => {
    const span = ((end - start) * c.length) / total;
    const item = { text: c, start: cursor, end: cursor + span };
    cursor += span;
    return item;
  });
}

export default function CreatorPreview({
  recipe,
  settings,
  moments,
  captions,
  captionStyle,
  videos,
  logoUrl,
  musicUrl,
  watermark,
  selectedMomentId,
  onSelectMoment,
  onCropChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // In fit mode, a muted, blurred copy of the same video fills the space around it.
  const backdropRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [wrap, setWrap] = useState({ w: 0, h: 0 });
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const [dragCrop, setDragCrop] = useState<{ id: string; crop: Crop } | null>(null);

  const tl = useMemo(() => buildTimeline(recipe, settings, moments, captions), [recipe, settings, moments, captions]);
  const seg = segmentAt(tl, t);
  const brand = settings.branding;
  const aspect = formatAspect(settings.format);
  const box = videoBox(recipe.layout, settings.format);

  // Fit the output frame inside the available area.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWrap({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stageH = Math.max(120, Math.min(wrap.h, wrap.w / aspect));
  const stageW = stageH * aspect;
  const short = Math.min(stageW, stageH);

  const setTime = useCallback((v: number) => {
    tRef.current = v;
    setT(v);
  }, []);

  // Keep the playhead inside the timeline as moments change.
  useEffect(() => {
    if (tRef.current > tl.duration) setTime(0);
  }, [tl.duration, setTime]);

  // Jump to the selected moment when it changes (unless playing).
  useEffect(() => {
    if (playing || !selectedMomentId) return;
    const s = tl.segments.find((x) => x.moment?.id === selectedMomentId);
    if (s && (seg?.moment?.id !== selectedMomentId)) setTime(s.start + 0.01);
  }, [selectedMomentId]);

  const activeVideo = seg?.kind === "moment" ? videos[seg.moment!.video_id] : undefined;
  const firstVideo = tl.segments.find((s) => s.kind === "moment")?.moment;
  const backdropVideo = activeVideo ?? (firstVideo ? videos[firstVideo.video_id] : undefined);

  // Point the <video> at the active moment and keep it in step with the playhead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !seg || seg.kind !== "moment" || !activeVideo?.video_url) return;
    const m = seg.moment!;
    const desired = m.start + (t - seg.start);
    if (v.dataset.src !== activeVideo.video_url) {
      v.dataset.src = activeVideo.video_url;
      v.src = activeVideo.video_url;
      v.currentTime = desired;
    } else if (!playing || Math.abs(v.currentTime - desired) > 0.35) {
      v.currentTime = desired;
    }
    v.volume = Math.max(0, Math.min(1, settings.music.original_audio_volume));
    v.muted = muted || !m.keep_audio;
    if (playing && v.paused) void v.play().catch(() => setPlaying(false));
    if (!playing && !v.paused) v.pause();
    const b = backdropRef.current;
    if (b) {
      if (b.dataset.src !== activeVideo.video_url) {
        b.dataset.src = activeVideo.video_url;
        b.src = activeVideo.video_url;
      }
      b.muted = true;
      b.currentTime = v.currentTime;
      if (playing && b.paused) void b.play().catch(() => undefined);
      if (!playing && !b.paused) b.pause();
    }
  }, [seg?.moment?.id, seg?.start, activeVideo?.video_url, playing, muted, settings.music.original_audio_volume]);

  // Scrubbing while paused moves the picture too.
  useEffect(() => {
    if (playing) return;
    const v = videoRef.current;
    if (!v || !seg || seg.kind !== "moment") return;
    const desired = seg.moment!.start + (t - seg.start);
    if (Math.abs(v.currentTime - desired) > 0.04) v.currentTime = desired;
    const b = backdropRef.current;
    if (b && Math.abs(b.currentTime - desired) > 0.04) b.currentTime = desired;
  }, [t, playing, seg]);

  // The clock: follow the video during moments, wall time during cards.
  useEffect(() => {
    if (!playing) {
      videoRef.current?.pause();
      backdropRef.current?.pause();
      audioRef.current?.pause();
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let cur = tRef.current;
      const s = segmentAt(tl, cur);
      const v = videoRef.current;
      if (s?.kind === "moment" && v && !v.paused && v.readyState >= 2) {
        cur = s.start + (v.currentTime - s.moment!.start);
        const b = backdropRef.current;
        if (b && Math.abs(b.currentTime - v.currentTime) > 0.25) b.currentTime = v.currentTime;
      } else {
        cur += dt;
      }
      const idx = s ? tl.segments.indexOf(s) : -1;
      const next = tl.segments[idx + 1];
      if (next && cur >= next.start) cur = next.start;
      if (cur >= tl.duration) {
        setPlaying(false);
        setTime(0);
        return;
      }
      tRef.current = cur;
      setT(cur);
      const a = audioRef.current;
      if (a && musicUrl) {
        const want = settings.music.start_offset + cur;
        const dur = a.duration || 0;
        const target = dur ? want % dur : want;
        if (Math.abs(a.currentTime - target) > 0.4) a.currentTime = target;
        a.volume = Math.max(0, Math.min(1, settings.music.volume));
        a.muted = muted;
        if (a.paused) void a.play().catch(() => undefined);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tl, musicUrl, muted, settings.music.start_offset, settings.music.volume, setTime]);

  // ------------------------------------------------------------------ framing (drag to reframe)
  const dragRef = useRef<{ x: number; y: number; crop: Crop; id: string; scale: number; srcW: number; srcH: number } | null>(null);
  const momentCrop = (m: Moment) => (dragCrop?.id === m.id ? dragCrop.crop : m.crop);
  // Matches the renderer: fit unless the user chose fill (fill still fits a screen-recording
  // template's moment that has no framing set).
  const fitsMoment = (m: Moment) =>
    (settings.framing ?? "fit") === "fit" || (!momentCrop(m) && recipe.layout.reframe === "none");

  const onPointerDown = (e: React.PointerEvent) => {
    if (!seg || seg.kind !== "moment") return;
    const m = seg.moment!;
    onSelectMoment(m.id);
    if (fitsMoment(m)) return;
    const d = dims[activeVideo?.video_url ?? ""];
    if (!d) return;
    const boxW = box.w * stageW;
    const win = cropWindow(d.w, d.h, boxAspect(box, settings.format), momentCrop(m));
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, crop: momentCrop(m) ?? { x: 0.5, y: 0.5, zoom: 1 }, id: m.id,
      scale: win.w / boxW, srcW: d.w, srcH: d.h };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * d.scale;
    const dy = (e.clientY - d.y) * d.scale;
    const crop = {
      ...d.crop,
      x: Math.min(1, Math.max(0, d.crop.x - dx / d.srcW)),
      y: Math.min(1, Math.max(0, d.crop.y - dy / d.srcH)),
    };
    setDragCrop({ id: d.id, crop });
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && dragCrop?.id === d.id) onCropChange(d.id, dragCrop.crop);
    setDragCrop(null);
  };

  // ------------------------------------------------------------------ drawing
  const videoStyle = (): CSSProperties => {
    const url = activeVideo?.video_url ?? "";
    const d = dims[url];
    const m = seg?.moment;
    const boxW = box.w * stageW;
    const boxH = box.h * stageH;
    if (!d || !m) return { width: "100%", height: "100%", objectFit: "cover" };
    const crop = momentCrop(m);
    if (fitsMoment(m)) return { position: "relative", width: "100%", height: "100%", objectFit: "contain" };
    const win = cropWindow(d.w, d.h, boxW / boxH, crop);
    const scale = boxW / win.w;
    return { position: "absolute", width: d.w * scale, height: d.h * scale, left: -win.x * scale, top: -win.y * scale, maxWidth: "none" };
  };

  const panelColor = (() => {
    const p = recipe.layout.panel_background ?? recipe.layout.background ?? "brand.primary";
    return p === "brand.accent" ? brand.accent : brand.primary;
  })();
  const blurBg = settings.background === "blur" || (seg?.kind === "card" && seg.background === "blur");
  const radius = recipe.layout.type === "frame" ? ((recipe.layout.corner_radius ?? 0) * short) / 1080 : 0;

  const textStyle = (font: string | undefined, size: string | undefined, boxColor?: string | null): CSSProperties => {
    const face = fontCss(familyFace(brand.font, font));
    const px = short * (TEXT_SIZES[size ?? "large"] ?? TEXT_SIZES.large);
    const base: CSSProperties = { ...face, fontSize: px, lineHeight: 1.18 };
    if (boxColor) {
      return { ...base, background: boxColor, color: contrastText(boxColor), padding: `${px * 0.18}px ${px * 0.35}px`,
        borderRadius: px * 0.12, display: "inline-block" };
    }
    return { ...base, color: "#fff", textShadow: `0 0 ${Math.max(1, px * 0.06)}px #000, 0 ${px * 0.04}px ${px * 0.08}px rgba(0,0,0,.6)` };
  };

  const renderCard = (s: Segment) => {
    const st = s.cardLayer?.style ?? {};
    const size = st.size ?? (s.cardRole === "outro" ? "large" : "xl");
    const font = st.font ?? (s.cardRole === "outro" ? "Montserrat ExtraBold" : "Bebas Neue");
    return (
      <div className="cp-card" style={{ background: blurBg ? undefined : brand.primary }}>
        {blurBg && backdropVideo?.thumbnail_url && <img className="cp-blur" src={backdropVideo.thumbnail_url} alt="" />}
        {s.cardText && (
          <div style={{ ...anchorStyle({ x: 0.5, y: 0.5, align: "center", valign: "middle" }, stageW, stageH) }}>
            <span style={textStyle(font, size)}>{s.cardText}</span>
          </div>
        )}
      </div>
    );
  };

  const captionNodes = (() => {
    if (!captionStyle || !settings.captions.enabled || seg?.kind !== "moment") return null;
    const cap = tl.captions.find((c) => c.start <= t && t < c.end);
    if (!cap) return null;
    const sizeKey = captionStyle.size ?? "medium";
    const px = short * (TEXT_SIZES[sizeKey] ?? TEXT_SIZES.medium) * settings.captions.size;
    const face = fontCss(familyFace(settings.captions.font, captionStyle.font));
    const upper = captionStyle.case === "upper";
    const text = upper ? cap.text.toUpperCase() : cap.text;
    const a = anchorFor(settings.captions.position, recipe.layout.type, box);
    const boxColor = captionStyle.box ? resolveColor(captionStyle.box.color, brand) : null;
    const active = resolveColor(settings.captions.highlight_color ?? captionStyle.active_word_color, brand, "#FFFFFF");
    const base = (captionStyle.color ?? "#FFFFFF").slice(0, 7);
    const dim = captionStyle.color?.length === 9 ? parseInt(captionStyle.color.slice(7), 16) / 255 : 1;
    const outline = captionStyle.outline ? Math.max(1, (captionStyle.outline.width * short) / 1080 / 2) : 0;
    const style: CSSProperties = {
      ...face, fontSize: px, lineHeight: 1.2,
      color: boxColor ? contrastText(boxColor) : base,
      WebkitTextStroke: outline ? `${outline}px ${captionStyle.outline!.color}` : undefined,
      paintOrder: "stroke fill",
      textShadow: captionStyle.shadow || !outline ? "0 2px 8px rgba(0,0,0,.7)" : undefined,
      background: boxColor ?? undefined,
      padding: boxColor ? `${px * 0.15}px ${px * 0.35}px` : undefined,
      borderRadius: boxColor ? px * 0.15 : undefined,
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
    };
    const perLine = Math.max(12, Math.round((stageW < stageH ? 26 : stageW === stageH ? 32 : 44) / settings.captions.size));
    if (captionStyle.granularity === "word") {
      const words = wordTimes(text.split(" "), cap.start, cap.end);
      const per = captionStyle.words_per_line ?? 0;
      const groups: (typeof words)[] = [];
      if (per) for (let i = 0; i < words.length; i += per) groups.push(words.slice(i, i + per));
      else {
        let cur: typeof words = [];
        for (const w of words) {
          if (cur.length && [...cur, w].map((x) => x.word).join(" ").length > perLine * 2) {
            groups.push(cur);
            cur = [];
          }
          cur.push(w);
        }
        if (cur.length) groups.push(cur);
      }
      const group = groups.find((g) => g[0].start <= t && t < g[g.length - 1].end) ?? groups[groups.length - 1];
      return (
        <div style={anchorStyle(a, stageW, stageH)}>
          <span style={style}>
            {group.map((w, i) => {
              const on = w.start <= t && t < w.end;
              return (
                <span key={i}>
                  {i > 0 && " "}
                  <span style={{ color: on ? active : undefined, opacity: on ? 1 : dim, display: "inline-block",
                    fontSize: on && captionStyle.animation === "pop" ? "1.12em" : undefined }}>
                    {w.word}
                  </span>
                </span>
              );
            })}
          </span>
        </div>
      );
    }
    const chunk = chunkCaption(text, cap.start, cap.end, perLine * (captionStyle.max_lines ?? 2)).find(
      (c) => c.start <= t && t < c.end,
    );
    if (!chunk) return null;
    return (
      <div style={anchorStyle(a, stageW, stageH)}>
        <span style={style}>{captionStyle.quote_marks ? `“${chunk.text}”` : chunk.text}</span>
      </div>
    );
  })();

  const logoStyle = (): CSSProperties => {
    const w = stageW * brand.logo_size;
    const m = stageW * 0.05;
    const pos = brand.logo_position;
    const s: CSSProperties = { position: "absolute", width: w, opacity: brand.logo_opacity };
    if (pos === "frame-top-left" && recipe.layout.type === "frame") return { ...s, left: box.x * stageW, top: (box.y * stageH) / 2, transform: "translateY(-50%)" };
    if (pos.includes("left")) s.left = m;
    else if (pos === "center-bottom") { s.left = "50%"; s.transform = "translateX(-50%)"; }
    else s.right = m;
    if (pos.startsWith("top") || pos === "frame-top-left") s.top = m;
    else s.bottom = pos === "center-bottom" ? m * 1.5 : m;
    return s;
  };

  const inMoment = seg?.kind === "moment";
  const fitting = inMoment && fitsMoment(seg!.moment!);
  const draggable = inMoment && !fitting;
  return (
    <div className="creator-preview">
      <div className="cp-wrap" ref={wrapRef}>
        <div
          className={cn("cp-stage", settings.format === "9:16" && "is-phone")}
          style={{ width: stageW, height: stageH, background: recipe.layout.type === "fill" ? "#000" : panelColor }}
        >
          {recipe.layout.type !== "fill" && blurBg && backdropVideo?.thumbnail_url && (
            <img className="cp-blur" src={backdropVideo.thumbnail_url} alt="" />
          )}
          <div
            className={cn("cp-video-box", draggable && "can-drag")}
            style={{ left: box.x * stageW, top: box.y * stageH, width: box.w * stageW, height: box.h * stageH, borderRadius: radius,
              visibility: inMoment ? "visible" : "hidden" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            title={draggable ? "Drag to reframe" : undefined}
            tabIndex={draggable ? 0 : -1}
            role={draggable ? "application" : undefined}
            aria-label={draggable ? "Framing. Use the arrow keys to move the picture" : undefined}
            onKeyDown={(e) => {
              if (!draggable || !e.key.startsWith("Arrow")) return;
              e.preventDefault();
              const m = seg!.moment!;
              const c = m.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
              const step = e.shiftKey ? 0.1 : 0.02;
              const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
              const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
              onCropChange(m.id, { ...c, x: Math.min(1, Math.max(0, c.x + dx)), y: Math.min(1, Math.max(0, c.y + dy)) });
            }}
          >
            <video
              ref={backdropRef}
              className="cp-backdrop"
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              style={{ display: fitting ? "block" : "none" }}
            />
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              style={videoStyle()}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                const url = v.dataset.src ?? "";
                if (v.videoWidth) setDims((d) => ({ ...d, [url]: { w: v.videoWidth, h: v.videoHeight } }));
              }}
            />
            {draggable && !playing && (
              <span className="cp-drag-hint">
                <Move size={11} /> Drag to reframe
              </span>
            )}
          </div>
          {seg?.kind === "card" && renderCard(seg)}
          {tl.texts
            .filter((x) => x.start <= t && t < x.end)
            .map((x, i) => {
              const a = anchorFor(x.layer.style.position ?? "top", recipe.layout.type, box);
              const boxColor = x.layer.style.box ? resolveColor(x.layer.style.box, brand) : null;
              const text = x.layer.role === "hook" && x.layer.style.font === "Bebas Neue" ? x.text.toUpperCase() : x.text;
              return (
                <div key={`${x.layer.id}-${i}`} style={anchorStyle(a, stageW, stageH)}>
                  {x.layer.style.accent_bar && (
                    <span className="cp-accent" style={{ background: resolveColor(x.layer.style.accent_bar, brand), height: short * 0.05 }} />
                  )}
                  <span style={textStyle(x.layer.style.font, x.layer.style.size, boxColor)}>{text}</span>
                </div>
              );
            })}
          {captionNodes}
          {logoUrl && brand.logo_enabled && <img src={logoUrl} alt="" style={logoStyle()} />}
          {watermark && <span className="cp-watermark">Made with FrameSeek</span>}
          {!moments.length && (
            <div className="cp-empty">Add a moment from your videos to start.</div>
          )}
        </div>
      </div>
      {musicUrl && <audio ref={audioRef} src={musicUrl} preload="auto" loop />}
      <div className="cp-controls">
        <button
          className="icon-button"
          aria-label={playing ? "Pause preview" : "Play preview"}
          disabled={!moments.length}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="cp-time">
          {formatClipTime(Math.min(t, tl.duration))} / {formatClipTime(tl.duration)}
        </span>
        <input
          type="range"
          className="cp-scrub"
          aria-label="Preview position"
          min={0}
          max={Math.max(0.1, tl.duration)}
          step={0.05}
          value={Math.min(t, tl.duration)}
          onChange={(e) => setTime(Number(e.target.value))}
        />
        <button className="icon-button" aria-label={muted ? "Unmute preview" : "Mute preview"} onClick={() => setMuted((m) => !m)}>
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
    </div>
  );
}
