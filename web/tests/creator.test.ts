import { expect, test } from "bun:test";
import catalog from "../../backend/app/assets/templates/catalog.json";
import type { CreationSettings, Moment, TemplateRecipe } from "../src/api/creations";
import { buildTimeline, cropWindow, outputSize, videoBox } from "../src/lib/creator";

const recipe = (id: string) => (catalog.templates as unknown as TemplateRecipe[]).find((t) => t.id === id)!;

/** Panel defaults as the server builds them (template_catalog.default_settings). */
function defaults(r: TemplateRecipe): CreationSettings {
  return {
    format: r.default_format,
    captions: { enabled: r.captions.enabled, style: r.captions.style, position: r.captions.position, size: 1, font: null, highlight_color: null },
    text: Object.fromEntries(
      r.text_layers.map((l) => [l.id, { enabled: true, text: l.default_text, texts: [], start: null,
        duration: typeof l.timing.duration === "number" ? l.timing.duration : null }]),
    ),
    branding: { logo_asset_id: null, logo_enabled: false, logo_position: "top-right", logo_size: 0.16, logo_opacity: 0.9, primary: "#111827", accent: "#F5B700", font: null },
    intro: { enabled: !!r.intro_card?.enabled, text: r.intro_card?.default_text ?? "", duration: r.intro_card?.duration ?? 2.5 },
    outro: { enabled: !!r.outro_card?.enabled, text: r.outro_card?.default_text ?? "", duration: r.outro_card?.duration ?? 2.5 },
    transition: { type: r.transitions.type as "cut", duration: r.transitions.duration ?? 0.4 },
    background: "brand",
    music: { asset_id: null, volume: 0.3, ducking: true, fade_in: 0.5, fade_out: 1, start_offset: 0, original_audio_volume: 1 },
    export: { resolution: 1080, file_name: "" },
  };
}

const moments = (n: number, len: number): Moment[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, video_id: "v", start: 10 * i, end: 10 * i + len, crop: null, keep_audio: true }));

test("crossfades overlap segments and cards wrap the moments, as in the renderer", () => {
  const r = recipe("event-highlights");
  const tl = buildTimeline(r, defaults(r), moments(4, 5), {});
  expect(tl.segments.map((s) => s.kind)).toEqual(["card", "moment", "moment", "moment", "moment", "card"]);
  expect(tl.transitionDuration).toBeCloseTo(0.3);
  // 2.5 + 4 × 5 + 2.5 minus five 0.3 s overlaps
  expect(tl.duration).toBeCloseTo(25 - 1.5);
  expect(tl.texts).toEqual([]);
});

test("per-moment text layers number each moment", () => {
  const r = recipe("tutorial-steps");
  const tl = buildTimeline(r, defaults(r), moments(2, 6), {});
  expect(tl.texts.map((t) => t.text)).toEqual(["Step 1: Title", "Step 2: Title"]);
  expect(tl.texts[0].end - tl.texts[0].start).toBeCloseTo(4);
});

test("captions map from source time into the output", () => {
  const r = recipe("clean-subtitles");
  const tl = buildTimeline(r, defaults(r), [{ id: "a", video_id: "v", start: 100, end: 106, crop: null, keep_audio: true }], {
    a: [
      { start: 98, end: 101, text: "cut at the start" },
      { start: 103, end: 104.5, text: "inside" },
      { start: 110, end: 112, text: "outside" },
    ],
  });
  expect(tl.captions.map((c) => [c.start, c.end, c.text])).toEqual([[0, 1, "cut at the start"], [3, 4.5, "inside"]]);
});

test("frame geometry matches the renderer", () => {
  expect(outputSize("9:16", 720)).toEqual([720, 1280]);
  expect(outputSize("4:5", 1080)).toEqual([1080, 1350]);
  const win = cropWindow(1920, 1080, 9 / 16, { x: 0.95, y: 0.5, zoom: 1 });
  expect(win.h).toBe(1080);
  expect(win.x + win.w).toBeLessThanOrEqual(1920);
  expect(videoBox(recipe("podcast-split").layout, "9:16")).toEqual({ x: 0, y: 0, w: 1, h: 0.62 });
});
