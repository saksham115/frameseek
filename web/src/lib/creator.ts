/**
 * Preview-side mirror of the server renderer's timeline and layout rules
 * (backend/app/services/render/{timeline,layout,ass}.py), so the editor preview places
 * moments, cards, text and captions where the render will.
 */
import type {
  CaptionLine,
  CreationFormat,
  CreationSettings,
  Crop,
  Moment,
  TemplateRecipe,
  TextLayerRecipe,
} from "@/api/creations";

export const FORMAT_LABELS: Record<CreationFormat, string> = {
  "9:16": "Vertical 9:16",
  "1:1": "Square 1:1",
  "4:5": "Portrait 4:5",
  "16:9": "Landscape 16:9",
};

export function formatAspect(format: CreationFormat): number {
  return { "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5, "16:9": 16 / 9 }[format];
}

export function outputSize(format: CreationFormat, shortEdge: number): [number, number] {
  const long = Math.round((shortEdge * { "9:16": 16 / 9, "16:9": 16 / 9, "4:5": 5 / 4, "1:1": 1 }[format]) / 2) * 2;
  if (format === "16:9") return [long, shortEdge];
  if (format === "1:1") return [shortEdge, shortEdge];
  return [shortEdge, long];
}

/** Box as fractions of the frame (0..1). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRAME_BAND = 0.14;

export function videoBox(layout: TemplateRecipe["layout"], format: CreationFormat): Box {
  if (layout.type === "split") return { x: 0, y: 0, w: 1, h: layout.video_ratio ?? 0.62 };
  if (layout.type === "frame") {
    const margin = layout.inset_margin ?? 0.06;
    return { x: margin, y: FRAME_BAND, w: 1 - 2 * margin, h: 1 - 2 * FRAME_BAND };
  }
  return { x: 0, y: 0, w: 1, h: 1 };
}

export function boxAspect(box: Box, format: CreationFormat): number {
  return (box.w / box.h) * formatAspect(format);
}

/** The source region (in source pixels) a crop shows in a box of `aspect`. */
export function cropWindow(srcW: number, srcH: number, aspect: number, crop: Crop | null) {
  const { x = 0.5, y = 0.5, zoom = 1 } = crop ?? {};
  let cw: number, ch: number;
  if (srcW / srcH > aspect) {
    ch = srcH / zoom;
    cw = ch * aspect;
  } else {
    cw = srcW / zoom;
    ch = cw / aspect;
  }
  const left = Math.min(Math.max(0, x * srcW - cw / 2), srcW - cw);
  const top = Math.min(Math.max(0, y * srcH - ch / 2), srcH - ch);
  return { x: left, y: top, w: cw, h: ch };
}

// ------------------------------------------------------------------ timeline

export interface Segment {
  kind: "moment" | "card";
  duration: number;
  start: number;
  moment?: Moment;
  momentIndex?: number;
  cardRole?: "intro" | "outro" | "between";
  cardText?: string;
  cardLayer?: TextLayerRecipe | null;
  background: "brand" | "blur";
}

export interface TimedText {
  layer: TextLayerRecipe;
  text: string;
  start: number;
  end: number;
}

export interface TimedCaption {
  start: number;
  end: number;
  text: string;
}

export interface Timeline {
  segments: Segment[];
  transition: string;
  transitionDuration: number;
  duration: number;
  texts: TimedText[];
  captions: TimedCaption[];
}

const end = (s: Segment) => s.start + s.duration;

function layerState(settings: CreationSettings, layer: TextLayerRecipe) {
  return settings.text[layer.id] ?? { enabled: true, text: layer.default_text, texts: [], start: null, duration: null };
}

function nth(texts: string[], fallback: string, i: number) {
  const t = texts[i]?.trim() ? texts[i] : fallback;
  return t.split("{n}").join(String(i + 1));
}

export function buildTimeline(
  recipe: TemplateRecipe,
  settings: CreationSettings,
  moments: Moment[],
  captions: Record<string, CaptionLine[]>,
): Timeline {
  const segments: Segment[] = [];
  const find = (p: (l: TextLayerRecipe) => boolean) => recipe.text_layers.find(p) ?? null;
  const introLayer = find((l) => l.timing.from === "intro");
  const outroLayer = find((l) => l.timing.from === "outro");
  const betweenLayer = find((l) => !!l.timing.between_moments);

  if (settings.intro.enabled && moments.length) {
    let text = settings.intro.text;
    if (introLayer && layerState(settings, introLayer).enabled) text = layerState(settings, introLayer).text || text;
    const blur = recipe.intro_card?.background === "blurred-first-moment" || settings.background === "blur";
    segments.push({ kind: "card", duration: settings.intro.duration, start: 0, cardRole: "intro", cardText: text,
      cardLayer: introLayer, background: blur ? "blur" : "brand" });
  }
  const between = betweenLayer ? layerState(settings, betweenLayer) : null;
  moments.forEach((m, i) => {
    if (i > 0 && betweenLayer && between?.enabled) {
      const d = between.duration ?? (typeof betweenLayer.timing.duration === "number" ? betweenLayer.timing.duration : 1.6);
      segments.push({ kind: "card", duration: d, start: 0, cardRole: "between",
        cardText: nth(between.texts, between.text, i - 1), cardLayer: betweenLayer, background: "brand" });
    }
    segments.push({ kind: "moment", duration: m.end - m.start, start: 0, moment: m, momentIndex: i, background: "brand" });
  });
  if (settings.outro.enabled && moments.length) {
    let text = settings.outro.text;
    if (outroLayer && layerState(settings, outroLayer).enabled) text = layerState(settings, outroLayer).text || text;
    segments.push({ kind: "card", duration: settings.outro.duration, start: 0, cardRole: "outro", cardText: text,
      cardLayer: outroLayer, background: "brand" });
  }

  let t = settings.transition.type !== "cut" ? settings.transition.duration : 0;
  if (segments.length > 1 && t > 0) t = Math.min(t, 0.45 * Math.min(...segments.map((s) => s.duration)));
  else t = 0;
  let cursor = 0;
  segments.forEach((s, i) => {
    s.start = cursor;
    cursor += s.duration - (i < segments.length - 1 ? t : 0);
  });

  const tl: Timeline = { segments, transition: t > 0 ? settings.transition.type : "cut", transitionDuration: t,
    duration: cursor, texts: [], captions: [] };

  const ms = segments.filter((s) => s.kind === "moment");
  if (ms.length) {
    const contentStart = ms[0].start;
    const contentEnd = end(ms[ms.length - 1]);
    for (const layer of recipe.text_layers) {
      const state = layerState(settings, layer);
      const timing = layer.timing;
      if (!state.enabled || timing.from === "intro" || timing.from === "outro" || timing.between_moments) continue;
      if (timing.per_moment) {
        ms.forEach((seg, i) => {
          const text = nth(state.texts, state.text, i);
          const d = state.duration ?? timing.duration;
          const e = d == null || d === "moment" || d === "full" ? end(seg) : Math.min(end(seg), seg.start + Number(d));
          if (text.trim()) tl.texts.push({ layer, text, start: seg.start, end: e });
        });
        continue;
      }
      const s = contentStart + (state.start ?? 0);
      const d = state.duration ?? timing.duration;
      const e = d == null || d === "full" ? contentEnd : Math.min(contentEnd, s + Number(d));
      if (state.text.trim() && e > s) tl.texts.push({ layer, text: state.text, start: s, end: e });
    }
  }

  if (settings.captions.enabled) {
    const out: TimedCaption[] = [];
    for (const seg of ms) {
      const m = seg.moment!;
      for (const line of captions[m.id] ?? []) {
        const s = Math.max(m.start, line.start);
        const e = Math.min(m.end, line.end);
        if (e - s < 0.05 || !line.text.trim()) continue;
        out.push({ start: seg.start + s - m.start, end: seg.start + e - m.start, text: line.text.trim() });
      }
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < out.length; i++) if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
    tl.captions = out.filter((c) => c.end - c.start >= 0.05);
  }
  return tl;
}

export function segmentAt(tl: Timeline, t: number): Segment | undefined {
  let found: Segment | undefined;
  for (const s of tl.segments) if (s.start <= t + 1e-6) found = s;
  return found;
}

// ------------------------------------------------------------------ text placement

/** Text sizes as a share of the frame's short edge (matches the renderer). */
export const TEXT_SIZES: Record<string, number> = { small: 0.038, medium: 0.05, large: 0.064, xl: 0.095, xxl: 0.13 };

export type Anchor = { x: number; y: number; align: "left" | "center" | "right"; valign: "top" | "middle" | "bottom" };

export function anchorFor(position: string, layoutType: string, box: Box): Anchor {
  const m = 0.06;
  let pos = position;
  if (pos === "panel-center" && layoutType !== "split") pos = "lower-middle";
  if ((pos === "panel-top" || pos === "video-bottom-left") && layoutType !== "split")
    pos = pos === "panel-top" ? "top" : "bottom-left";
  if (pos.startsWith("frame-") && layoutType !== "frame") pos = pos === "frame-top" ? "top" : "bottom";
  const vb = box.y + box.h;
  const table: Record<string, Anchor> = {
    top: { x: 0.5, y: 0.08, align: "center", valign: "top" },
    "top-left": { x: m, y: 0.06, align: "left", valign: "top" },
    "bottom-left": { x: m, y: 0.86, align: "left", valign: "bottom" },
    center: { x: 0.5, y: 0.5, align: "center", valign: "middle" },
    middle: { x: 0.5, y: 0.5, align: "center", valign: "middle" },
    "lower-middle": { x: 0.5, y: 0.74, align: "center", valign: "bottom" },
    bottom: { x: 0.5, y: 0.92, align: "center", valign: "bottom" },
    "frame-top": { x: 0.5, y: box.y / 2, align: "center", valign: "middle" },
    "frame-bottom": { x: 0.5, y: vb + (1 - vb) / 2, align: "center", valign: "middle" },
    "panel-top": { x: 0.5, y: vb + 0.04, align: "center", valign: "top" },
    "panel-center": { x: 0.5, y: vb + (1 - vb) / 2, align: "center", valign: "middle" },
    "video-bottom-left": { x: m, y: vb - 0.03, align: "left", valign: "bottom" },
  };
  return table[pos] ?? table.bottom;
}

/** Catalogue font name -> CSS family/weight/style of the bundled preview fonts. */
export function fontCss(name: string | null | undefined): { fontFamily: string; fontWeight: number; fontStyle: string } {
  const n = name ?? "Inter Bold";
  if (n.startsWith("Montserrat")) return { fontFamily: "'FS Montserrat'", fontWeight: 800, fontStyle: "normal" };
  if (n.startsWith("Poppins")) return { fontFamily: "'FS Poppins'", fontWeight: 700, fontStyle: "normal" };
  if (n.startsWith("Playfair")) return { fontFamily: "'FS Playfair Display'", fontWeight: 700, fontStyle: "italic" };
  if (n.startsWith("Bebas")) return { fontFamily: "'FS Bebas Neue'", fontWeight: 400, fontStyle: "normal" };
  if (n.startsWith("DM Serif")) return { fontFamily: "'FS DM Serif Display'", fontWeight: 400, fontStyle: "normal" };
  if (n === "Inter SemiBold") return { fontFamily: "'FS Inter', 'FS Devanagari'", fontWeight: 600, fontStyle: "normal" };
  return { fontFamily: "'FS Inter', 'FS Devanagari'", fontWeight: 700, fontStyle: "normal" };
}

/** A font family chosen in Branding/Captions maps to that family's bundled face. */
export function familyFace(family: string | null | undefined, fallback: string | undefined) {
  if (!family) return fallback;
  return (
    {
      Inter: "Inter Bold",
      Montserrat: "Montserrat ExtraBold",
      Poppins: "Poppins Bold",
      "Playfair Display": "Playfair Display",
      "Bebas Neue": "Bebas Neue",
      "DM Serif Display": "DM Serif Display",
    }[family] ?? fallback
  );
}

export function resolveColor(value: string | undefined | null, brand: CreationSettings["branding"], fallback = "#FFFFFF") {
  if (!value) return fallback;
  if (value === "brand.primary") return brand.primary;
  if (value === "brand.accent") return brand.accent;
  return value.length === 9 ? value.slice(0, 7) : value;
}

export function contrastText(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#111111" : "#FFFFFF";
}

/** Spread a caption line's time across its words by length (the renderer does the same). */
export function wordTimes(words: string[], start: number, endT: number) {
  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = start;
  return words.map((w, i) => {
    const span = ((endT - start) * weights[i]) / total;
    const item = { word: w, start: cursor, end: cursor + span };
    cursor += span;
    return item;
  });
}

export function newMomentId() {
  return `m${Math.random().toString(36).slice(2, 9)}`;
}

export function momentsTotal(moments: Moment[]) {
  return moments.reduce((n, m) => n + (m.end - m.start), 0);
}
