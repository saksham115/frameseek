export const MAX_CLIP_SECONDS = 120;
export type ClipRange = [number, number];

export function formatClipTime(seconds: number): string {
  const ticks = Math.round(Math.max(0, seconds) * 100);
  const minutes = Math.floor(ticks / 6000);
  return `${String(minutes).padStart(2, "0")}:${((ticks % 6000) / 100).toFixed(2).padStart(5, "0")}`;
}
export function parseClipTime(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d{1,2})?$/.test(p)))
    return null;
  if (parts.length > 1 && parts.slice(1).some((p) => Number(p) >= 60))
    return null;
  if (parts.slice(0, -1).some((p) => p.includes("."))) return null;
  const result = parts.reduce((n, p) => n * 60 + Number(p), 0);
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
}
export function rangeError(
  start: number | null,
  end: number | null,
  duration: number,
): string | null {
  if (start === null || end === null)
    return "Enter seconds or a timecode like 01:24.50.";
  if (start < 0 || end > duration + 0.001)
    return "Keep both points within the video.";
  if (end - start < 0.099)
    return "The out point must be at least 0.10 seconds after the in point.";
  if (end - start > MAX_CLIP_SECONDS + 0.001)
    return "Choose a selection of 2 minutes or less.";
  return null;
}
