"""Render the looping previews shown on the template gallery cards.

Each template is rendered by the real renderer from Pexels stock clips (see
web/public/template-previews/CREDITS.md), with sample text and captions, then compressed
to a short muted loop plus a poster frame.

The renderer needs ffmpeg with libass and the bundled fonts installed, so run this in the
backend image:

    docker run --rm -v "$PWD":/src -v <clips dir>:/clips -w /src/backend frameseek-backend-local \
        python scripts/build_template_previews.py /clips ../web/public/template-previews

The clips directory holds the source clips named as in CLIPS below.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.render.pipeline import Renderer, probe  # noqa: E402
from app.services.template_catalog import caption_styles, default_settings, list_templates  # noqa: E402

SHORT_EDGE = 360

# template id -> clips with in/out seconds, text per layer id, per-moment texts, caption lines per moment, settings
PREVIEWS: dict[str, dict] = {
    "hook-and-caption": {
        "moments": [("talk-woman", 0.5, 7.0)],
        "text": {"hook": "3 tips nobody tells you"},
        "captions": [["Here's the one thing", "that changed how I work", "and it takes two minutes"]],
    },
    "podcast-split": {
        "moments": [("podcast-interview", 1.0, 7.5)],
        "text": {"show-title": "The Creator Show · Ep. 42", "speaker": "Amara Okafor"},
        "captions": [["The best ideas come from", "listening to your audience", "every single week"]],
        "settings": {"outro": {"enabled": False}},
    },
    "highlight-reel": {
        "moments": [("skate-1", 1.0, 3.6), ("skate-2", 0.5, 3.1), ("skate-3", 2.0, 4.6)],
        "text": {"title": "Summer session"},
        "settings": {"outro": {"enabled": False}},
    },
    "clean-subtitles": {
        "moments": [("two-people-talking", 0.5, 7.5)],
        "captions": [["So what made you start the company?", "Honestly, a problem we kept running into."]],
    },
    "vlog-recap": {
        "moments": [("beach-sunset", 1.0, 3.6), ("city-night", 1.0, 3.6), ("shibuya", 1.0, 3.6)],
        "text": {"title": "A week away"},
        "texts": {"place": ["Big Sur", "London", "Tokyo"]},
        "settings": {"outro": {"enabled": False}},
    },
    "product-spotlight": {
        "moments": [("shoe-spin", 0.5, 3.5), ("coffee-pour", 1.0, 4.0)],
        "text": {"headline": "Meet the new drop"},
        "texts": {"feature": ["Hand-stitched leather", "Made for mornings"]},
        "settings": {"outro": {"enabled": False}},
    },
    "customer-testimonial": {
        "moments": [("talk-woman-2", 0.5, 7.0)],
        "text": {"name": "Maria Lopez · Founder, Casa Verde"},
        "captions": [["It saved our team hours", "every single week."]],
        "settings": {"outro": {"enabled": False}},
    },
    "event-highlights": {
        "moments": [("concert-drone", 1.0, 3.0), ("concert-fun", 1.0, 3.0), ("speaker-podium", 1.0, 3.0), ("conference-talk", 1.0, 3.0)],
        "text": {"event": "Summit 2026 · Bengaluru"},
        "settings": {"intro": {"duration": 1.6}, "outro": {"enabled": False}},
    },
    "tutorial-steps": {
        "moments": [("chopping-2", 0.5, 4.0), ("chopping", 0.5, 4.0)],
        "texts": {"step": ["Step 1: Prep the veg", "Step 2: Slice thin"]},
        "captions": [["Start with everything laid out"], ["Keep the knife moving"]],
        "settings": {"intro": {"enabled": False}, "outro": {"enabled": False}},
    },
    "announcement-teaser": {
        "moments": [("espresso", 1.0, 3.0), ("coffee-pour", 1.5, 3.5), ("shoe-spin", 0.5, 2.5)],
        "text": {"card": "Something new", "cta": "Launching 12 October"},
        "texts": {"card": ["Something new", "is brewing"]},
        "settings": {"outro": {"duration": 1.8}},
    },
}


def _merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in patch.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def build(clips_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    styles = caption_styles()
    for recipe in list_templates():
        cfg = PREVIEWS[recipe["id"]]
        settings = default_settings(recipe)
        settings = _merge(settings, cfg.get("settings", {}))
        settings["branding"]["logo_enabled"] = False
        # The examples crop to the frame, which suits the stock clips' subjects.
        settings["framing"] = "fill"
        for layer_id, value in cfg.get("text", {}).items():
            settings["text"][layer_id]["text"] = value
        for layer_id, texts in cfg.get("texts", {}).items():
            settings["text"][layer_id]["texts"] = texts

        sources, moments, captions = {}, [], {}
        for i, (clip, start, end) in enumerate(cfg["moments"]):
            path = clips_dir / f"{clip}.mp4"
            sources[clip] = probe(str(path))
            mid = f"m{i}"
            moments.append({"id": mid, "video_id": clip, "start": start, "end": end, "crop": None, "keep_audio": False})
            lines = (cfg.get("captions") or [])
            if i < len(lines):
                span = (end - start) / len(lines[i])
                captions[mid] = [
                    {"start": start + j * span, "end": start + (j + 1) * span, "text": t} for j, t in enumerate(lines[i])
                ]
        if not cfg.get("captions"):
            settings["captions"]["enabled"] = False

        spec = {"recipe": recipe, "settings": settings, "moments": moments, "captions": captions, "resolution": SHORT_EDGE}
        with tempfile.TemporaryDirectory() as tmp:
            renderer = Renderer(spec, sources, Path(tmp))
            style = styles.get(settings["captions"]["style"], styles["clean"])
            output = renderer.run(style, watermark=False)
            target = out_dir / f"{recipe['id']}.mp4"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(output), "-an", "-c:v", "libx264", "-preset", "slow",
                 "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)],
                check=True,
            )
            poster_at = renderer.timeline.moments[0].start + min(1.2, renderer.timeline.moments[0].duration / 2)
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-ss", f"{poster_at:.2f}", "-i", str(output), "-frames:v", "1",
                 "-q:v", "5", str(out_dir / f"{recipe['id']}.jpg")],
                check=True,
            )
        print(f"{recipe['id']}: {target.stat().st_size // 1024} KB, {renderer.timeline.duration:.1f}s")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_template_previews.py <clips dir> <output dir>")
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
