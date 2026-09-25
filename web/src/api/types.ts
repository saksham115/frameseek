export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  storage_used_bytes: number;
  storage_limit_bytes: number;
}

export type VideoStatus = "uploaded" | "queued" | "processing" | "completed" | "failed";

export interface Video {
  id: string;
  title: string;
  status: VideoStatus;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
  progress?: number;
}

export interface SearchMatch {
  video_id: string;
  video_title: string;
  timestamp_seconds: number;
  frame_url: string;
  score: number;
}

export interface Plan {
  id: string;
  name: string;
  price_id: string | null;
  storage_gb: number;
  monthly_searches: number;
}

// ---- Raw backend shapes + mappers (the API uses video_id/plan_type/ready etc.) ----

interface RawUser {
  user_id: string;
  email: string;
  name: string | null;
  plan_type: string;
  storage_used_bytes: number;
  storage_limit_bytes: number;
}

export function mapUser(u: RawUser): User {
  return {
    id: u.user_id,
    email: u.email,
    name: u.name,
    plan: u.plan_type,
    storage_used_bytes: u.storage_used_bytes,
    storage_limit_bytes: u.storage_limit_bytes,
  };
}

interface RawVideo {
  video_id: string;
  title: string;
  status: string;
  processing_progress?: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, VideoStatus> = {
  ready: "completed",
  completed: "completed",
  error: "failed",
  failed: "failed",
  processing: "processing",
  queued: "queued",
  uploaded: "uploaded",
};

export function mapVideo(v: RawVideo): Video {
  return {
    id: v.video_id,
    title: v.title,
    status: STATUS_MAP[v.status] ?? "uploaded",
    duration_seconds: v.duration_seconds != null ? Number(v.duration_seconds) : null,
    thumbnail_url: v.thumbnail_url,
    video_url: v.video_url,
    created_at: v.created_at,
    progress: v.processing_progress ?? 0,
  };
}
