"""The system template catalogue and the panel defaults each template implies.

Templates are data (``app/assets/templates/catalog.json``): adding one is adding a recipe.
A creation copies its template's recipe when it's made, and ``default_settings`` turns the
recipe into the adjustable panel's starting state.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.schemas.creation import FORMATS, CreationSettings

CATALOG_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "catalog.json"

# Starting brand colours: neutral enough to suit any footage until the user sets theirs.
DEFAULT_PRIMARY = "#111827"
DEFAULT_ACCENT = "#F5B700"


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    with open(CATALOG_PATH, encoding="utf-8") as fh:
        catalog = json.load(fh)
    for t in catalog["templates"]:
        bad = [f for f in t["formats"] if f not in FORMATS]
        if bad:
            raise ValueError(f"Template {t['id']} has unknown formats {bad}")
    return catalog


def list_templates() -> list[dict]:
    return load_catalog()["templates"]


def get_template(template_id: str) -> dict | None:
    return next((t for t in list_templates() if t["id"] == template_id), None)


def caption_styles() -> dict:
    return load_catalog()["caption_styles"]


def default_settings(recipe: dict, fmt: str | None = None) -> dict:
    """The panel's starting state for a recipe: every control at the template default."""
    captions = recipe.get("captions") or {}
    caption_position = captions.get("position", "bottom")
    if caption_position not in ("top", "middle", "lower-middle", "bottom", "panel-center"):
        caption_position = "bottom"

    text: dict[str, dict] = {}
    for layer in recipe.get("text_layers", []):
        timing = layer.get("timing", {})
        text[layer["id"]] = {
            "enabled": True,
            "text": layer.get("default_text", ""),
            "texts": [],
            "start": None,
            "duration": timing.get("duration") if isinstance(timing.get("duration"), (int, float)) else None,
        }

    logo = (recipe.get("branding") or {}).get("logo") or {}
    intro = recipe.get("intro_card") or {}
    outro = recipe.get("outro_card") or {}
    transitions = recipe.get("transitions") or {}
    music = recipe.get("music") or {}
    layout = recipe.get("layout") or {}

    settings = {
        "format": fmt if fmt in recipe.get("formats", []) else recipe.get("default_format", "9:16"),
        "captions": {
            "enabled": bool(captions.get("enabled", False)),
            "style": captions.get("style", "clean"),
            "position": caption_position,
            "size": 1.0,
            "font": None,
            "highlight_color": None,
        },
        "text": text,
        "branding": {
            "logo_asset_id": None,
            "logo_enabled": bool(logo.get("default_enabled", False)),
            "logo_position": logo.get("position", "top-right"),
            "logo_size": 0.16,
            "logo_opacity": float(logo.get("opacity", 0.9)),
            "primary": DEFAULT_PRIMARY,
            "accent": DEFAULT_ACCENT,
            "font": None,
        },
        "intro": {
            "enabled": bool(intro.get("enabled", False)),
            "text": intro.get("default_text", ""),
            "duration": float(intro.get("duration", 2.5)),
        },
        "outro": {
            "enabled": bool(outro.get("enabled", False)),
            "text": outro.get("default_text", ""),
            "duration": float(outro.get("duration", 2.5)),
        },
        "transition": {
            "type": transitions.get("type", "cut"),
            "duration": float(transitions.get("duration", 0.4)),
        },
        "background": "blur" if layout.get("background") == "blur" else "brand",
        "music": {
            "asset_id": None,
            "volume": float(music.get("volume", 0.3)) or 0.3,
            "ducking": bool(music.get("ducking", True)),
            "fade_in": float(music.get("fade_in", 0.5)),
            "fade_out": float(music.get("fade_out", 1.0)),
            "start_offset": 0.0,
            "original_audio_volume": float(music.get("original_audio_volume", 1.0)),
        },
        "export": {"resolution": 1080, "file_name": ""},
    }
    return CreationSettings.model_validate(settings).model_dump(mode="json")


def merge_settings(recipe: dict, current: dict, patch: dict) -> dict:
    """Apply a partial settings update (nested dicts merge; other values replace) and
    validate the result. Text layers the recipe doesn't define are dropped."""

    def merge(base: dict, update: dict) -> dict:
        out = dict(base)
        for key, value in update.items():
            if isinstance(value, dict) and isinstance(out.get(key), dict):
                out[key] = merge(out[key], value)
            else:
                out[key] = value
        return out

    merged = merge(current or default_settings(recipe), patch or {})
    layer_ids = {layer["id"] for layer in recipe.get("text_layers", [])}
    merged["text"] = {k: v for k, v in (merged.get("text") or {}).items() if k in layer_ids}
    if merged.get("format") not in recipe.get("formats", []):
        merged["format"] = recipe.get("default_format", "9:16")
    return CreationSettings.model_validate(merged).model_dump(mode="json")
