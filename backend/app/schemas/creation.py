"""Creation (template draft) shapes: moments, the adjustable panel's settings, captions.

Settings are validated on every save, with unknown keys dropped, so what the renderer
reads is always well-formed whatever the client sends.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

FORMATS = ("9:16", "1:1", "4:5", "16:9")
Format = Literal["9:16", "1:1", "4:5", "16:9"]
CaptionStyle = Literal["bold-pop", "clean", "boxed", "karaoke", "quote"]
CaptionPosition = Literal["top", "middle", "lower-middle", "bottom", "panel-center"]
LogoPosition = Literal[
    "top-left", "top-right", "bottom-left", "bottom-right", "center-bottom",
    "frame-top-left", "panel-bottom-right",
]
TransitionType = Literal["cut", "crossfade", "slide"]
FontFamily = Literal["Inter", "Montserrat", "Poppins", "Playfair Display", "Bebas Neue", "DM Serif Display"]

_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

MAX_TEXT = 200
MAX_MOMENTS = 20


def _hex(value: str | None) -> str | None:
    if value is None:
        return None
    if not _HEX.match(value):
        raise ValueError("Colours must look like #RRGGBB.")
    return value.upper()


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Crop(_Model):
    """Framing for a moment: the crop window's centre (0..1 of the source frame) and
    zoom (1 = the largest window of the target shape that fits)."""

    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)
    zoom: float = Field(1.0, ge=1, le=3)


class Moment(_Model):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    video_id: uuid.UUID
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    crop: Crop | None = None
    keep_audio: bool = True
    # Set when the user picked the framing by hand; auto-framing then leaves it alone.
    crop_locked: bool = False

    @field_validator("end")
    @classmethod
    def _end_after_start(cls, end: float, info):
        start = info.data.get("start")
        if start is not None and end - start < 0.5:
            raise ValueError("A moment must be at least half a second long.")
        return end


class CaptionSettings(_Model):
    enabled: bool = True
    style: CaptionStyle = "clean"
    position: CaptionPosition = "bottom"
    size: float = Field(1.0, ge=0.6, le=1.6)
    font: FontFamily | None = None
    highlight_color: str | None = None

    _check_hex = field_validator("highlight_color")(lambda cls, v: _hex(v))


class TextLayerSettings(_Model):
    enabled: bool = True
    text: str = Field("", max_length=MAX_TEXT)
    # One text per moment (per-moment layers) or per gap (between-moment cards).
    texts: list[str] = Field(default_factory=list, max_length=MAX_MOMENTS)
    start: float | None = Field(None, ge=0)
    duration: float | None = Field(None, gt=0, le=600)

    @field_validator("texts")
    @classmethod
    def _short_texts(cls, texts: list[str]) -> list[str]:
        return [t[:MAX_TEXT] for t in texts]


class BrandingSettings(_Model):
    logo_asset_id: uuid.UUID | None = None
    logo_enabled: bool = False
    logo_position: LogoPosition = "top-right"
    logo_size: float = Field(0.16, ge=0.06, le=0.4)  # fraction of the frame width
    logo_opacity: float = Field(0.9, ge=0.1, le=1)
    primary: str = "#111827"
    accent: str = "#F5B700"
    font: FontFamily | None = None

    _check_hex = field_validator("primary", "accent")(lambda cls, v: _hex(v))


class CardSettings(_Model):
    enabled: bool = False
    text: str = Field("", max_length=MAX_TEXT)
    duration: float = Field(2.5, ge=1, le=8)


class TransitionSettings(_Model):
    type: TransitionType = "cut"
    duration: float = Field(0.4, ge=0.1, le=1.5)


class MusicSettings(_Model):
    # A stock library track, or one of the user's uploads (asset_id). One at a time.
    track_id: str | None = Field(None, max_length=80, pattern=r"^[a-z0-9-]+$")
    asset_id: uuid.UUID | None = None
    volume: float = Field(0.3, ge=0, le=1)
    ducking: bool = True
    fade_in: float = Field(0.5, ge=0, le=10)
    fade_out: float = Field(1.0, ge=0, le=10)
    start_offset: float = Field(0, ge=0, le=3600)
    original_audio_volume: float = Field(1.0, ge=0, le=1)


class ExportSettings(_Model):
    resolution: Literal[720, 1080] = 1080
    file_name: str = Field("", max_length=120)


class CreationSettings(_Model):
    format: Format = "9:16"
    captions: CaptionSettings = Field(default_factory=CaptionSettings)
    text: dict[str, TextLayerSettings] = Field(default_factory=dict)
    branding: BrandingSettings = Field(default_factory=BrandingSettings)
    intro: CardSettings = Field(default_factory=CardSettings)
    outro: CardSettings = Field(default_factory=CardSettings)
    transition: TransitionSettings = Field(default_factory=TransitionSettings)
    # Background behind the video for "frame" layouts and behind blurred cards.
    background: Literal["blur", "brand"] = "brand"
    music: MusicSettings = Field(default_factory=MusicSettings)
    export: ExportSettings = Field(default_factory=ExportSettings)


class CaptionLine(_Model):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(max_length=500)


# ---- requests / responses ---------------------------------------------------------


class CreationCreateRequest(_Model):
    template_id: str = Field(max_length=64)
    name: str | None = Field(None, max_length=200)
    format: Format | None = None
    moments: list[Moment] = Field(default_factory=list, max_length=MAX_MOMENTS)


class CreationUpdateRequest(_Model):
    name: str | None = Field(None, min_length=1, max_length=200)
    moments: list[Moment] | None = Field(None, max_length=MAX_MOMENTS)
    settings: dict | None = None
    caption_edits: dict[str, list[CaptionLine]] | None = None


class RenderRequest(_Model):
    resolution: Literal[720, 1080] | None = None


class RenderResponse(_Model):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    render_id: uuid.UUID
    creation_id: uuid.UUID
    status: str
    progress: int
    current_step: str | None = None
    format: str
    resolution: int
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    size_bytes: int | None = None
    watermarked: bool = False
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None


class CreationResponse(_Model):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    creation_id: uuid.UUID
    name: str
    template_id: str
    template_version: int
    recipe: dict
    moments: list[dict]
    settings: dict
    caption_edits: dict
    created_at: datetime
    updated_at: datetime
    latest_render: RenderResponse | None = None
    thumbnail_url: str | None = None


class AssetUploadRequest(_Model):
    kind: Literal["logo", "music"]
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    content_type: str = Field(max_length=100)
    rights_confirmed: bool = False


class AssetResponse(_Model):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    asset_id: uuid.UUID
    kind: str
    filename: str
    content_type: str
    size_bytes: int
    status: str
    duration_seconds: float | None = None
    created_at: datetime
    url: str | None = None
