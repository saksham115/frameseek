"""Frame geometry shared by the renderer (and mirrored by the web preview).

Everything is in output pixels. Sizes are kept even because H.264 with 4:2:0 chroma
needs even dimensions.
"""

from __future__ import annotations

from dataclasses import dataclass

# Short edge -> output size per format.
_LONG_EDGE = {"9:16": 16 / 9, "16:9": 16 / 9, "4:5": 5 / 4, "1:1": 1.0}


def _even(value: float) -> int:
    return max(2, int(round(value / 2)) * 2)


def output_size(fmt: str, short_edge: int) -> tuple[int, int]:
    long_edge = _even(short_edge * _LONG_EDGE[fmt])
    if fmt == "16:9":
        return long_edge, short_edge
    if fmt == "1:1":
        return short_edge, short_edge
    return short_edge, long_edge  # 9:16 and 4:5 are portrait


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    w: int
    h: int

    @property
    def aspect(self) -> float:
        return self.w / self.h


# Bands above and below the inset video in "frame" layouts, for the headline and callouts.
FRAME_BAND = 0.14


def video_box(layout: dict, width: int, height: int) -> Box:
    """Where the video sits in the frame for a recipe layout."""
    kind = layout.get("type", "fill")
    if kind == "split":
        return Box(0, 0, width, _even(height * float(layout.get("video_ratio", 0.62))))
    if kind == "frame":
        margin = _even(width * float(layout.get("inset_margin", 0.06)))
        band = _even(height * FRAME_BAND)
        return Box(margin, band, _even(width - 2 * margin), _even(height - 2 * band))
    return Box(0, 0, width, height)


def crop_window(
    src_w: int, src_h: int, target_aspect: float, x: float = 0.5, y: float = 0.5, zoom: float = 1.0,
) -> Box:
    """The source region to show in a box of ``target_aspect``: the largest window of that
    shape (divided by ``zoom``) centred on (x, y), pushed back inside the frame."""
    if src_w / src_h > target_aspect:
        ch = src_h / zoom
        cw = ch * target_aspect
    else:
        cw = src_w / zoom
        ch = cw / target_aspect
    cw, ch = min(_even(cw), src_w - src_w % 2), min(_even(ch), src_h - src_h % 2)
    left = min(max(0.0, x * src_w - cw / 2), src_w - cw)
    top = min(max(0.0, y * src_h - ch / 2), src_h - ch)
    return Box(int(left), int(top), cw, ch)


def crop_centre_from_box(src_w: int, src_h: int, bx: float, by: float, bw: float, bh: float) -> tuple[float, float]:
    """Normalised centre of a detected region of interest."""
    return (
        min(1.0, max(0.0, (bx + bw / 2) / src_w)),
        min(1.0, max(0.0, (by + bh / 2) / src_h)),
    )
