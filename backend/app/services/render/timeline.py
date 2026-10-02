"""Turn a creation into an output timeline: segments (moments and text cards) with their
start times, plus the timed text layers and captions that sit on top.

Pure functions over the frozen render spec, so the timing rules are testable without
ffmpeg.
"""

from __future__ import annotations

from dataclasses import dataclass, field

MIN_TRANSITION_SHARE = 0.45  # a transition never takes more than this share of a segment


@dataclass
class Segment:
    kind: str  # "moment" | "card"
    duration: float
    start: float = 0.0  # in the output
    moment: dict | None = None
    moment_index: int | None = None
    card_role: str | None = None  # "intro" | "outro" | "between"
    card_text: str = ""
    card_layer: dict | None = None  # the text layer whose style the card text uses
    background: str = "brand"  # "brand" | "blur"

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass
class TimedText:
    layer: dict
    text: str
    start: float
    end: float


@dataclass
class TimedCaption:
    start: float
    end: float
    text: str


@dataclass
class Timeline:
    segments: list[Segment]
    transition: str
    transition_duration: float
    duration: float
    texts: list[TimedText] = field(default_factory=list)
    captions: list[TimedCaption] = field(default_factory=list)

    @property
    def moments(self) -> list[Segment]:
        return [s for s in self.segments if s.kind == "moment"]


def _layer(recipe: dict, predicate) -> dict | None:
    return next((l for l in recipe.get("text_layers", []) if predicate(l.get("timing", {}))), None)


def _layer_settings(settings: dict, layer: dict) -> dict:
    return (settings.get("text") or {}).get(layer["id"]) or {"enabled": True, "text": layer.get("default_text", "")}


def _nth(texts: list[str], fallback: str, i: int) -> str:
    text = texts[i] if i < len(texts) and texts[i].strip() else fallback
    return text.replace("{n}", str(i + 1))


def build_timeline(recipe: dict, settings: dict, moments: list[dict], captions: dict[str, list[dict]] | None = None) -> Timeline:
    captions = captions or {}
    segments: list[Segment] = []

    intro_layer = _layer(recipe, lambda t: t.get("from") == "intro")
    outro_layer = _layer(recipe, lambda t: t.get("from") == "outro")
    between_layer = _layer(recipe, lambda t: t.get("between_moments"))
    intro_bg = (recipe.get("intro_card") or {}).get("background", "brand.primary")

    intro = settings.get("intro") or {}
    if intro.get("enabled") and moments:
        text = intro.get("text", "")
        if intro_layer and _layer_settings(settings, intro_layer).get("enabled", True):
            text = _layer_settings(settings, intro_layer).get("text") or text
        segments.append(Segment(
            "card", float(intro.get("duration", 2.5)), card_role="intro", card_text=text,
            card_layer=intro_layer,
            background="blur" if intro_bg == "blurred-first-moment" or settings.get("background") == "blur" else "brand",
        ))

    between = _layer_settings(settings, between_layer) if between_layer else None
    for i, m in enumerate(moments):
        if i > 0 and between_layer and between.get("enabled", True):
            dur = float(between.get("duration") or between_layer["timing"].get("duration", 1.6))
            segments.append(Segment(
                "card", dur, card_role="between",
                card_text=_nth(between.get("texts") or [], between.get("text", ""), i - 1),
                card_layer=between_layer,
            ))
        segments.append(Segment("moment", float(m["end"]) - float(m["start"]), moment=m, moment_index=i))

    outro = settings.get("outro") or {}
    if outro.get("enabled") and moments:
        text = outro.get("text", "")
        if outro_layer and _layer_settings(settings, outro_layer).get("enabled", True):
            text = _layer_settings(settings, outro_layer).get("text") or text
        segments.append(Segment("card", float(outro.get("duration", 2.5)), card_role="outro",
                                card_text=text, card_layer=outro_layer))

    transition = (settings.get("transition") or {}).get("type", "cut")
    t = float((settings.get("transition") or {}).get("duration", 0.4)) if transition != "cut" else 0.0
    if len(segments) > 1 and t > 0:
        t = min(t, MIN_TRANSITION_SHARE * min(s.duration for s in segments))
    else:
        t = 0.0

    cursor = 0.0
    for i, seg in enumerate(segments):
        seg.start = round(cursor, 3)
        cursor += seg.duration - (t if i < len(segments) - 1 else 0)
    duration = round(cursor, 3)

    timeline = Timeline(segments, transition if t > 0 else "cut", round(t, 3), duration)
    timeline.texts = _timed_texts(recipe, settings, timeline)
    timeline.captions = _timed_captions(settings, timeline, captions)
    return timeline


def _timed_texts(recipe: dict, settings: dict, tl: Timeline) -> list[TimedText]:
    moments = tl.moments
    if not moments:
        return []
    content_start, content_end = moments[0].start, moments[-1].end
    out: list[TimedText] = []
    for layer in recipe.get("text_layers", []):
        timing = layer.get("timing", {})
        state = _layer_settings(settings, layer)
        if not state.get("enabled", True):
            continue
        if timing.get("from") in ("intro", "outro") or timing.get("between_moments"):
            continue  # drawn on the cards
        if timing.get("per_moment"):
            for i, seg in enumerate(moments):
                text = _nth(state.get("texts") or [], state.get("text", ""), i)
                dur = state.get("duration") or timing.get("duration")
                end = seg.end if dur in (None, "moment") else min(seg.end, seg.start + float(dur))
                if text.strip():
                    out.append(TimedText(layer, text, seg.start, end))
            continue
        start = content_start + float(state.get("start") or 0)
        dur = state.get("duration") if state.get("duration") is not None else timing.get("duration")
        end = content_end if dur in (None, "full") else min(content_end, start + float(dur))
        text = state.get("text", "")
        if text.strip() and end > start:
            out.append(TimedText(layer, text, round(start, 3), round(end, 3)))
    return out


def _timed_captions(settings: dict, tl: Timeline, captions: dict[str, list[dict]]) -> list[TimedCaption]:
    if not (settings.get("captions") or {}).get("enabled"):
        return []
    out: list[TimedCaption] = []
    for seg in tl.moments:
        m = seg.moment
        m_start, m_end = float(m["start"]), float(m["end"])
        for line in captions.get(m["id"], []):
            s, e = max(m_start, float(line["start"])), min(m_end, float(line["end"]))
            text = (line.get("text") or "").strip()
            if e - s < 0.05 or not text:
                continue
            out.append(TimedCaption(round(seg.start + s - m_start, 3), round(seg.start + e - m_start, 3), text))
    out.sort(key=lambda c: c.start)
    # Crossfades overlap neighbouring moments; never show two caption lines at once.
    for prev, cur in zip(out, out[1:]):
        if prev.end > cur.start:
            prev.end = cur.start
    return [c for c in out if c.end - c.start >= 0.05]
