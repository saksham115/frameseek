import { api } from "./client";
import type { Pagination } from "./videos";

export interface Clip {
  clip_id: string;
  title: string;
  start_time: number;
  end_time: number;
  duration_seconds: number;
  file_size_bytes: number | null;
  clip_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
}
const mapClip = (c: Clip): Clip => ({
  ...c,
  start_time: Number(c.start_time),
  end_time: Number(c.end_time),
  duration_seconds: Number(c.duration_seconds),
});
export async function listClips(videoId: string, page = 1) {
  const { data } = await api.get<{ clips: Clip[]; pagination: Pagination }>(
    "/clips",
    {
      params: { video_id: videoId, page, limit: 8 },
    },
  );
  return { ...data, clips: data.clips.map(mapClip) };
}
export async function createClip(
  videoId: string,
  title: string,
  start: number,
  end: number,
) {
  const { data } = await api.post<Clip>(
    "/clips",
    {
      video_id: videoId,
      title,
      start_time: start,
      end_time: end,
    },
    { timeout: 210_000 },
  );
  return mapClip(data);
}
export async function getClip(id: string) {
  const { data } = await api.get<Clip>(`/clips/${id}`);
  return mapClip(data);
}
export async function downloadClip(id: string) {
  // Refresh auth and the signed URL on every download; saved URLs expire.
  const { data } = await api.get<{ download_url: string; filename: string }>(
    `/clips/${id}/download-url`,
  );
  const link = document.createElement("a");
  link.href = data.download_url;
  link.download = data.filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
export async function deleteClip(id: string) {
  await api.delete(`/clips/${id}`);
}
