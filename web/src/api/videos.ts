import { api } from "./client";
import { mapVideo, type Video } from "./types";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}
export const LIBRARY_PAGE_SIZE = 12;

export interface LibraryQuery {
  page?: number;
  sort?: string;
  order?: string;
  status?: string;
  folderId?: string;
  q?: string;
}

export async function getLibrary({
  page = 1,
  sort = "created_at",
  order = "desc",
  status,
  folderId,
  q,
}: LibraryQuery = {}) {
  const { data } = await api.get<{ videos: unknown[]; pagination: Pagination }>(
    "/videos",
    {
      params: {
        page,
        limit: LIBRARY_PAGE_SIZE,
        sort,
        order,
        status: status || undefined,
        folder_id: folderId || undefined,
        q: q?.trim() || undefined,
      },
    },
  );
  return {
    videos: data.videos.map((v) => mapVideo(v as never)),
    pagination: data.pagination,
  };
}

export interface VideoFrame {
  frame_id: string;
  timestamp_seconds: number;
  frame_url: string | null;
  thumbnail_url: string | null;
}
export async function getFrames(id: string, page = 1) {
  const { data } = await api.get<{
    frames: VideoFrame[];
    pagination: Pagination;
  }>(`/videos/${id}/frames`, { params: { limit: 100, page } });
  return {
    ...data,
    frames: data.frames.map((f) => ({
      ...f,
      timestamp_seconds: Number(f.timestamp_seconds),
    })),
  };
}

export interface Shot {
  shot_index: number;
  start_seconds: number;
  end_seconds: number;
  frame_count: number;
  frame_id: string;
  timestamp_seconds: number;
  frame_url: string | null;
  thumbnail_url: string | null;
}
/** Consecutive look-alike frames grouped into shots, in time order. */
export async function getShots(id: string): Promise<Shot[]> {
  const { data } = await api.get<{ shots: Shot[] }>(`/videos/${id}/shots`);
  return data.shots ?? [];
}

export interface TranscriptSegment {
  segment_id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}
export async function getTranscript(id: string) {
  const { data } = await api.get<{
    segments: TranscriptSegment[];
    language: string | null;
  }>(`/videos/${id}/transcript`);
  return data;
}

export async function renameVideo(id: string, title: string) {
  await api.patch(`/videos/${id}`, { title });
}

export async function moveVideo(id: string, folderId: string | null) {
  await api.patch(`/videos/${id}`, { folder_id: folderId });
}

/** Re-run the full processing pipeline (used to recover a failed video). */
export async function reprocessVideo(id: string) {
  await api.post(`/videos/${id}/process`, {});
}

export async function retryTranscript(id: string) {
  await api.post(`/videos/${id}/retry-transcript`);
}

export async function listVideos(): Promise<Video[]> {
  const { data } = await api.get<{ videos: unknown[] }>("/videos");
  return (data.videos ?? []).map((v) => mapVideo(v as never));
}

export async function getVideo(id: string): Promise<Video> {
  const { data } = await api.get<{ video: unknown }>(`/videos/${id}`);
  return mapVideo(data.video as never);
}

// Two-step resumable upload: ask the API for a short-lived SAS URL, then PUT the file
// straight to Blob Storage from the browser so the API never proxies large videos.
export async function createUploadTarget(
  filename: string,
  sizeBytes: number,
  contentType: string,
  folderId?: string | null,
) {
  const { data } = await api.post<{ video_id: string; upload_url: string }>(
    "/videos/upload-url",
    {
      filename,
      size_bytes: sizeBytes,
      content_type: contentType,
      folder_id: folderId || undefined,
    },
  );
  return data;
}

export async function uploadToBlob(
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  await api.put(uploadUrl, file, {
    baseURL: "",
    signal,
    withCredentials: false,
    headers: {
      "Content-Type": file.type,
      "x-ms-blob-type": "BlockBlob",
    },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    },
  });
}

export async function finalizeUpload(
  videoId: string,
  signal?: AbortSignal,
): Promise<Video> {
  const { data } = await api.post<unknown>(`/videos/${videoId}/finalize`, undefined, {
    signal,
  });
  return mapVideo(data as never);
}

export async function deleteVideo(id: string): Promise<void> {
  await api.delete(`/videos/${id}`);
}
