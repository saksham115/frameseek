"""Template recipes, the output timeline, and the ASS text the renderer burns in."""

import pytest

from app.schemas.creation import CreationSettings
from app.services.render.ass import _word_times, ass_color, build_ass, clean_text
from app.services.render.layout import crop_window, output_size, video_box
from app.services.render.timeline import build_timeline
from app.services.template_catalog import caption_styles, default_settings, get_template, list_templates, merge_settings


def _moments(n, length=4.0):
    return [{"id": f"m{i}", "video_id": "v", "start": 10.0 * i, "end": 10.0 * i + length, "crop": None, "keep_audio": True}
            for i in range(n)]


@pytest.mark.parametrize("template", list_templates(), ids=lambda t: t["id"])
def test_every_template_has_valid_defaults_and_a_timeline(template):
    settings = default_settings(template)
    CreationSettings.model_validate(settings)
    assert settings["format"] in template["formats"]
    assert set(settings["text"]) == {l["id"] for l in template["text_layers"]}
    assert template["captions"]["style"] in caption_styles()

    n = max(1, template["moments"]["min"])
    tl = build_timeline(template, settings, _moments(n), {})
    assert len(tl.moments) == n
    assert tl.duration > 0
    build_ass(tl, template, settings, caption_styles()[template["captions"]["style"]],
              *output_size(settings["format"], 720), video_box(template["layout"], *output_size(settings["format"], 720)),
              watermark=True)


def test_merge_settings_validates_and_drops_unknown_layers():
    recipe = get_template("hook-and-caption")
    current = default_settings(recipe)
    merged = merge_settings(recipe, current, {
        "text": {"hook": {"text": "New hook"}, "made-up": {"text": "x"}},
        "branding": {"primary": "#ff0000"},
        "format": "16:9",  # not offered by this template
    })
    assert merged["text"]["hook"]["text"] == "New hook"
    assert "made-up" not in merged["text"]
    assert merged["branding"]["primary"] == "#FF0000"
    assert merged["format"] == recipe["default_format"]
    with pytest.raises(Exception):
        merge_settings(recipe, current, {"branding": {"accent": "red"}})


def test_crossfade_overlaps_segments_and_cards_wrap_moments():
    recipe = get_template("event-highlights")
    settings = default_settings(recipe)
    tl = build_timeline(recipe, settings, _moments(4, 5.0), {})
    kinds = [s.kind for s in tl.segments]
    assert kinds == ["card", "moment", "moment", "moment", "moment", "card"]
    t = tl.transition_duration
    assert tl.transition == "crossfade" and t == pytest.approx(0.3)
    for prev, cur in zip(tl.segments, tl.segments[1:]):
        assert cur.start == pytest.approx(prev.end - t, abs=1e-3)
    assert tl.duration == pytest.approx(tl.segments[-1].end, abs=1e-3)
    # The event title layer is drawn on the intro card, not over the footage.
    assert tl.segments[0].card_text == settings["text"]["event"]["text"]
    assert not tl.texts


def test_between_moment_cards_and_per_moment_text():
    recipe = get_template("announcement-teaser")
    settings = default_settings(recipe)
    settings["text"]["card"]["texts"] = ["One", "Two"]
    tl = build_timeline(recipe, settings, _moments(3, 3.0), {})
    cards = [s.card_text for s in tl.segments if s.card_role == "between"]
    assert cards == ["One", "Two"]

    recipe = get_template("tutorial-steps")
    settings = default_settings(recipe)
    tl = build_timeline(recipe, settings, _moments(2, 6.0), {})
    steps = [t for t in tl.texts if t.layer["id"] == "step"]
    assert [s.text for s in steps] == ["Step 1: Title", "Step 2: Title"]
    assert steps[0].end - steps[0].start == pytest.approx(4.0)


def test_captions_map_source_time_into_the_output():
    recipe = get_template("clean-subtitles")
    settings = default_settings(recipe)
    moments = [{"id": "a", "video_id": "v", "start": 100.0, "end": 106.0}]
    captions = {"a": [
        {"start": 98.0, "end": 101.0, "text": "cut at the start"},
        {"start": 103.0, "end": 104.5, "text": "inside"},
        {"start": 110.0, "end": 112.0, "text": "outside"},
    ]}
    tl = build_timeline(recipe, settings, moments, captions)
    assert [(c.start, c.end, c.text) for c in tl.captions] == [(0.0, 1.0, "cut at the start"), (3.0, 4.5, "inside")]


def test_crop_window_keeps_the_target_shape_inside_the_frame():
    win = crop_window(1920, 1080, 9 / 16, x=0.95, y=0.5)
    assert win.h == 1080 and abs(win.w / win.h - 9 / 16) < 0.01
    assert win.x + win.w <= 1920
    zoomed = crop_window(1920, 1080, 9 / 16, x=0.5, y=0.5, zoom=2)
    assert zoomed.h == 540


def test_ass_helpers():
    assert ass_color("#FF8000") == "&H000080FF"
    assert ass_color("#000000", 0.0) == "&HFF000000"
    assert clean_text("a {\\b1} b\n c") == "a (/b1) b c"
    words = _word_times(["hi", "there"], 0.0, 1.0)
    assert words[0][1] == 0.0 and words[-1][2] == pytest.approx(1.0)


def test_word_captions_highlight_each_word_in_turn():
    recipe = get_template("hook-and-caption")
    settings = default_settings(recipe)
    moments = [{"id": "a", "video_id": "v", "start": 0.0, "end": 3.0}]
    tl = build_timeline(recipe, settings, moments, {"a": [{"start": 0, "end": 3, "text": "one two three four"}]})
    w, h = output_size("9:16", 720)
    ass = build_ass(tl, recipe, settings, caption_styles()["bold-pop"], w, h, video_box(recipe["layout"], w, h), False)
    lines = [l for l in ass.splitlines() if l.startswith("Dialogue") and ",Caption," in l]
    assert len(lines) == 4  # one event per word, three words per line then one
    assert "ONE" in lines[0] and "Made with FrameSeek" not in ass
