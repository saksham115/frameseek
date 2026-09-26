import { MAX_CLIP_SECONDS, type ClipRange } from "@/lib/clip-time";
import type { Shot } from "@/api/videos";

export function shotAt<T extends { start_seconds: number; end_seconds: number }>(
  shots: T[],
  seconds: number,
): T | undefined {
  return (
    shots.find((s) => seconds >= s.start_seconds && seconds < s.end_seconds) ??
    (shots.length && seconds >= shots[shots.length - 1].start_seconds
      ? shots[shots.length - 1]
      : undefined)
  );
}

/** A shot's span as a clip range: clamped to the video and the export length limit. */
export function shotClipRange(
  start: number,
  end: number,
  duration: number,
): ClipRange {
  const from = Math.max(0, Math.min(start, duration));
  const to = Math.min(duration, end, from + MAX_CLIP_SECONDS);
  const round = (n: number) => Math.round(n * 100) / 100;
  // Very short shots still get a usable selection.
  return to - from < 0.5
    ? [round(Math.max(0, to - 0.5)), round(Math.max(to, Math.min(duration, from + 0.5)))]
    : [round(from), round(to)];
}

/** "?clip=12.5-31" ↔ range, so search results can open the editor with a shot selected. */
export function parseClipParam(value: string | null): ClipRange | null {
  const m = value?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const range: ClipRange = [Number(m[1]), Number(m[2])];
  return range[1] > range[0] ? range : null;
}

export const clipParam = (start: number, end: number) =>
  `${Math.round(start * 100) / 100}-${Math.round(end * 100) / 100}`;

export type { Shot };
