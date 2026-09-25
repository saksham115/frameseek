import { api } from "./client";
import { mapVideo, type Video } from "./types";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}
export async function getLibrary(
  page = 1,
  sort = "created_at",
  order = "desc",
  status?: string,
) {
  const { data } = await api.get<{ videos: unknown[]; pagination: Pagination }>(
    "/videos",
    {
      params: { page, limit: 12, sort, order, status: status || undefined },
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
) {
  const { data } = await api.post<{ video_id: string; upload_url: string }>(
    "/videos/upload-url",
    {
      filename,
      size_bytes: sizeBytes,
      content_type: contentType,
    },
  );
  return data;
}

export async function uploadToBlob(
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  await api.put(uploadUrl, file, {
    baseURL: "",
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

export async function finalizeUpload(videoId: string): Promise<Video> {
  const { data } = await api.post<unknown>(`/videos/${videoId}/finalize`);
  return mapVideo(data as never);
}

export async function deleteVideo(id: string): Promise<void> {
  await api.delete(`/videos/${id}`);
}
