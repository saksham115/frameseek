"""Build the ASS subtitle file that carries every piece of text in a render: captions (all
five styles, including word-by-word highlighting), text layers, card text and the
watermark. ffmpeg burns it in with libass, using the bundled fonts.
"""

from __future__ import annotations

import re

from app.services.render.layout import Box
from app.services.render.timeline import Segment, Timeline, TimedCaption

# Catalogue font names -> (family, bold, italic) as installed (app/assets/fonts).
FONT_FACES: dict[str, tuple[str, bool, bool]] = {
    "Inter": ("Inter", True, False),
    "Inter SemiBold": ("Inter", False, False),  # nearest weight to regular is the 600 file
    "Inter Bold": ("Inter", True, False),
    "Montserrat": ("Montserrat", True, False),
    "Montserrat ExtraBold": ("Montserrat", True, False),
    "Poppins": ("Poppins", True, False),
    "Poppins Bold": ("Poppins", True, False),
    "Playfair Display": ("Playfair Display", True, True),
    "Playfair Display SemiBold Italic": ("Playfair Display", True, True),
    "Bebas Neue": ("Bebas Neue", False, False),
    "DM Serif Display": ("DM Serif Display", False, False),
}

# libass sizes text by line height (the font's Windows ascent + descent), not by em, so an
# em size is multiplied by this ratio per family (read from each bundled font's OS/2 table).
# This keeps renders the same size as the browser preview, which sizes by em.
LINE_HEIGHT = {
    "Inter": 1.430,
    "Montserrat": 1.562,
    "Poppins": 1.762,
    "Playfair Display": 1.410,
    "Bebas Neue": 1.300,
    "DM Serif Display": 1.371,
}

# Text size (em) as a share of the frame's short edge.
SIZES = {"small": 0.038, "medium": 0.05, "large": 0.064, "xl": 0.095, "xxl": 0.13}

# Characters per caption line, by how wide the frame is relative to its height.
def _chars_per_line(width: int, height: int, size: float) -> int:
    base = 26 if width < height else (32 if width == height else 44)
    return max(12, int(base / size))


def _face(name: str | None) -> tuple[str, bool, bool]:
    return FONT_FACES.get(name or "", FONT_FACES["Inter Bold"])


def ass_color(hex_color: str, alpha: float = 1.0) -> str:
    """#RRGGBB(AA) -> &HAABBGGRR (ASS alpha is transparency)."""
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    if len(h) == 8:
        alpha *= int(h[6:8], 16) / 255
    a = 255 - int(round(255 * max(0.0, min(1.0, alpha))))
    return f"&H{a:02X}{b}{g}{r}".upper()


def _ts(seconds: float) -> str:
    cs = int(round(max(0.0, seconds) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def clean_text(text: str) -> str:
    """Text as plain ASS: no override blocks, no escapes, single spaces."""
    text = text.replace("{", "(").replace("}", ")").replace("\\", "/")
    return re.sub(r"\s+", " ", text).strip()


def resolve_color(value: str | None, brand: dict, default: str = "#FFFFFF") -> str:
    if not value:
        return default
    if value == "brand.primary":
        return brand.get("primary", "#111827")
    if value == "brand.accent":
        return brand.get("accent", "#F5B700")
    return value


def _contrast_text(bg_hex: str) -> str:
    h = bg_hex.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return "#111111" if (0.299 * r + 0.587 * g + 0.114 * b) > 170 else "#FFFFFF"


class AssBuilder:
    def __init__(self, width: int, height: int, video: Box, layout_type: str, brand: dict):
        self.w, self.h, self.video, self.layout_type, self.brand = width, height, video, layout_type, brand
        self.short = min(width, height)
        self.styles: dict[str, str] = {}
        self.events: list[str] = []
        self.margin = int(width * 0.06)

    # ------------------------------------------------------------------ styles
    def style(self, name: str, *, font: str | None, size: float, color: str = "#FFFFFF",
              outline_color: str = "#000000", outline: float = 0, shadow: float = 0,
              box: str | None = None, box_padding: float = 0) -> str:
        family, bold, italic = _face(font)
        size_px = max(10, int(self.short * size * LINE_HEIGHT.get(family, 1.4)))
        if box:
            border_style, outline_c, outline_w, back = 3, ass_color(box), max(2, int(box_padding)), ass_color(box)
        else:
            border_style, outline_c, outline_w, back = 1, ass_color(outline_color), outline, ass_color("#000000", 0.55)
        self.styles[name] = (
            f"Style: {name},{family},{size_px},{ass_color(color)},{ass_color(color)},{outline_c},{back},"
            f"{-1 if bold else 0},{-1 if italic else 0},0,0,100,100,0,0,{border_style},{outline_w:g},{shadow:g},"
            f"5,{self.margin},{self.margin},0,1"
        )
        return name

    # ------------------------------------------------------------------ placement
    def anchor(self, position: str) -> tuple[int, int, int]:
        """(an, x, y) for a named position."""
        w, h, v, m = self.w, self.h, self.video, self.margin
        band = v.y if self.layout_type == "frame" else int(h * 0.12)
        table = {
            "top": (8, w // 2, int(h * 0.08)),
            "top-left": (7, m, int(h * 0.06)),
            "bottom-left": (1, m, int(h * 0.86)),
            "center": (5, w // 2, h // 2),
            "middle": (5, w // 2, h // 2),
            "lower-middle": (2, w // 2, int(h * 0.74)),
            "bottom": (2, w // 2, int(h * 0.92)),
            "frame-top": (5, w // 2, band // 2),
            "frame-bottom": (5, w // 2, v.y + v.h + (h - v.y - v.h) // 2),
            "panel-top": (8, w // 2, v.y + v.h + int(h * 0.04)),
            "panel-center": (5, w // 2, v.y + v.h + (h - v.y - v.h) // 2),
            "video-bottom-left": (1, m, v.y + v.h - int(h * 0.03)),
        }
        if position == "panel-center" and self.layout_type != "split":
            position = "lower-middle"
        if position in ("panel-top", "video-bottom-left") and self.layout_type != "split":
            position = {"panel-top": "top", "video-bottom-left": "bottom-left"}[position]
        if position.startswith("frame-") and self.layout_type != "frame":
            position = {"frame-top": "top", "frame-bottom": "bottom"}[position]
        return table.get(position, table["bottom"])

    def add(self, start: float, end: float, style: str, text: str, position: str, tags: str = "") -> None:
        if end - start < 0.02 or not text:
            return
        an, x, y = self.anchor(position)
        self.events.append(
            f"Dialogue: 0,{_ts(start)},{_ts(end)},{style},,0,0,0,,{{\\an{an}\\pos({x},{y}){tags}}}{text}"
        )

    # ------------------------------------------------------------------ text layers and cards
    def _layer_style(self, layer: dict | None, default_font: str = "Montserrat ExtraBold", default_size: str = "large") -> str:
        st = (layer or {}).get("style", {})
        font = self.brand.get("font") or st.get("font") or default_font
        if self.brand.get("font"):
            font = next((k for k in FONT_FACES if k.startswith(self.brand["font"])), font)
        size = SIZES.get(st.get("size", default_size), SIZES["large"])
        box = st.get("box")
        name = f"T_{(layer or {}).get('id', 'card')}".replace("-", "_")
        if box:
            bg = resolve_color(box, self.brand)
            return self.style(name, font=font, size=size, color=_contrast_text(bg), box=bg, box_padding=self.short * 0.012)
        return self.style(name, font=font, size=size, outline=max(1, self.short * 0.003), shadow=self.short * 0.002,
                          outline_color="#000000")

    def _animation(self, layer: dict | None, duration: float) -> str:
        anim = ((layer or {}).get("style") or {}).get("animation")
        fade = min(250, int(duration * 250))
        if anim == "slam":
            return "\\fscx140\\fscy140\\t(0,180,\\fscx100\\fscy100)"
        if anim in ("fade", "fade-up"):
            return f"\\fad({fade},{fade})"
        return f"\\fad({min(120, fade)},{min(120, fade)})"

    def text_layer(self, layer: dict, text: str, start: float, end: float) -> None:
        st = layer.get("style", {})
        style = self._layer_style(layer)
        position = st.get("position", "top")
        clean = clean_text(text)
        if layer.get("role") == "hook":
            clean = clean.upper() if st.get("font") == "Bebas Neue" else clean
        tags = self._animation(layer, end - start)
        if st.get("accent_bar"):
            an, x, y = self.anchor(position)
            bar_w, bar_h = max(4, int(self.short * 0.008)), int(self.short * SIZES.get(st.get("size", "small"), 0.04) * 1.3)
            self.events.append(
                f"Dialogue: 1,{_ts(start)},{_ts(end)},{style},,0,0,0,,"
                f"{{\\an7\\pos({x},{y - bar_h})\\bord0\\shad0\\1c{ass_color(resolve_color(st['accent_bar'], self.brand))}\\p1{tags}}}"
                f"m 0 0 l {bar_w} 0 {bar_w} {bar_h} 0 {bar_h}{{\\p0}}"
            )
            self.events.append(
                f"Dialogue: 1,{_ts(start)},{_ts(end)},{style},,0,0,0,,{{\\an1\\pos({x + bar_w * 3},{y}){tags}}}{clean}"
            )
            return
        self.add(start, end, style, clean, position, tags)

    def card(self, seg: Segment) -> None:
        if not seg.card_text.strip():
            return
        layer = seg.card_layer
        st = (layer or {}).get("style", {})
        size = st.get("size", "xl" if seg.card_role in ("intro", "between") else "large")
        style = self._layer_style({"id": f"card_{seg.card_role}", "style": {**st, "size": size, "box": None}},
                                  default_font="Montserrat ExtraBold" if seg.card_role == "outro" else "Bebas Neue",
                                  default_size=size)
        self.add(seg.start, seg.end, style, clean_text(seg.card_text), "center", self._animation(layer, seg.duration))

    # ------------------------------------------------------------------ captions
    def captions(self, captions: list[TimedCaption], settings: dict, style_def: dict) -> None:
        if not captions:
            return
        size = SIZES.get(style_def.get("size", "medium"), SIZES["medium"]) * float(settings.get("size", 1.0))
        font = style_def.get("font")
        if settings.get("font"):
            font = next((k for k in FONT_FACES if k.startswith(settings["font"])), font)
        color = style_def.get("color", "#FFFFFF")
        active = resolve_color(settings.get("highlight_color") or style_def.get("active_word_color"), self.brand, "#FFFFFF")
        box = resolve_color(style_def["box"]["color"], self.brand) if style_def.get("box") else None
        outline = style_def.get("outline") or {}
        shadow = style_def.get("shadow")
        style = self.style(
            "Caption", font=font, size=size, color=_contrast_text(box) if box else color,
            outline_color=outline.get("color", "#000000"),
            outline=(outline.get("width", 0) * self.short / 1080) if outline else (self.short * 0.002 if not box else 0),
            shadow=self.short * 0.004 if shadow else 0, box=box, box_padding=self.short * 0.012,
        )
        position = settings.get("position", "bottom")
        upper = style_def.get("case") == "upper"
        quote = style_def.get("quote_marks")
        per_line = _chars_per_line(self.w, self.h, size / SIZES["medium"])
        max_lines = int(style_def.get("max_lines", 2))

        for cap in captions:
            text = clean_text(cap.text.upper() if upper else cap.text)
            if style_def.get("granularity") == "word":
                self._word_captions(cap, text, style, position, active, color, style_def, per_line)
                continue
            for chunk, s, e in _chunk(text, cap.start, cap.end, per_line * max_lines):
                self.add(s, e, style, f"“{chunk}”" if quote else chunk, position)

    def _word_captions(self, cap: TimedCaption, text: str, style: str, position: str, active: str,
                       base: str, style_def: dict, per_line: int) -> None:
        words = text.split(" ")
        timed = _word_times(words, cap.start, cap.end)
        group_size = int(style_def.get("words_per_line") or 0)
        groups: list[list[tuple[str, float, float]]] = []
        if group_size:
            groups = [timed[i:i + group_size] for i in range(0, len(timed), group_size)]
        else:
            current: list[tuple[str, float, float]] = []
            for item in timed:
                if current and len(" ".join(w for w, _, _ in current + [item])) > per_line * 2:
                    groups.append(current)
                    current = []
                current.append(item)
            if current:
                groups.append(current)
        pop = style_def.get("animation") == "pop"
        for group in groups:
            for idx, (_, s, e) in enumerate(group):
                parts = []
                for j, (word, _, _) in enumerate(group):
                    if j == idx:
                        grow = "\\fscx112\\fscy112" if pop else ""
                        parts.append(f"{{\\1c{ass_color(active)}{grow}}}{word}{{\\1c{ass_color(base)}\\fscx100\\fscy100}}")
                    else:
                        parts.append(word)
                end = group[idx + 1][1] if idx + 1 < len(group) else e
                self.add(s, end, style, " ".join(parts), position)

    # ------------------------------------------------------------------ watermark
    def watermark(self, duration: float) -> None:
        style = self.style("Watermark", font="Inter Bold", size=0.026, color="#FFFFFF", outline=1, shadow=1)
        self.events.append(
            f"Dialogue: 2,{_ts(0)},{_ts(duration)},{style},,0,0,0,,"
            f"{{\\an3\\pos({self.w - self.margin},{self.h - int(self.h * 0.025)})\\alpha&H50&}}Made with FrameSeek"
        )

    def build(self) -> str:
        header = (
            "[Script Info]\nScriptType: v4.00+\n"
            f"PlayResX: {self.w}\nPlayResY: {self.h}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
            "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, "
            "Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        )
        body = "\n".join(self.styles.values())
        events = "\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        return header + body + events + "\n".join(self.events) + "\n"


def _word_times(words: list[str], start: float, end: float) -> list[tuple[str, float, float]]:
    """Spread a line's time across its words by length: a close stand-in for word-level
    timestamps that stays right when the user edits the caption text."""
    weights = [len(w) + 1 for w in words]
    total = sum(weights) or 1
    out, cursor = [], start
    for word, weight in zip(words, weights):
        span = (end - start) * weight / total
        out.append((word, round(cursor, 3), round(cursor + span, 3)))
        cursor += span
    return out


def _chunk(text: str, start: float, end: float, max_chars: int) -> list[tuple[str, float, float]]:
    """Split a long caption into on-screen chunks, timed by their share of the text."""
    words = text.split(" ")
    chunks: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    total = sum(len(c) for c in chunks) or 1
    out, cursor = [], start
    for c in chunks:
        span = (end - start) * len(c) / total
        out.append((c, cursor, cursor + span))
        cursor += span
    return out


def build_ass(tl: Timeline, recipe: dict, settings: dict, caption_style: dict,
              width: int, height: int, video: Box, watermark: bool) -> str:
    brand = settings.get("branding") or {}
    builder = AssBuilder(width, height, video, (recipe.get("layout") or {}).get("type", "fill"), brand)
    builder.captions(tl.captions, settings.get("captions") or {}, caption_style)
    for item in tl.texts:
        builder.text_layer(item.layer, item.text, item.start, item.end)
    for seg in tl.segments:
        if seg.kind == "card":
            builder.card(seg)
    if watermark:
        builder.watermark(tl.duration)
    return builder.build()
