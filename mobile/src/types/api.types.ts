export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    request_id?: string;
    timestamp: string;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface UserData {
  user_id: string;
  email: string;
  name: string;
  plan_type: string;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  tos_accepted_at: string | null;
}

export interface AuthData {
  user: UserData;
  tokens: Tokens;
}

export interface VideoData {
  video_id: string;
  title: string;
  description: string | null;
  original_filename: string;
  file_size_bytes: number;
  status: string;
  processing_progress: number;
  frame_count: number | null;
  local_uri: string | null;
  thumbnail_uri: string | null;
  source_type: string;
  folder_id: string | null;
  tags: string[] | null;
  duration_seconds: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  created_at: string;
  updated_at: string;
}

export interface FrameData {
  frame_id: string;
  video_id: string;
  frame_index: number;
  timestamp_seconds: number;
  frame_path: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  embedding_id: string | null;
  created_at: string;
}

export interface JobData {
  job_id: string;
  video_id: string;
  video_title: string | null;
  job_type: string;
  status: string;
  progress: number;
  current_step: string | null;
  total_frames: number | null;
  processed_frames: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SearchResultData {
  frame_id: string;
  video_id: string;
  video_title: string;
  timestamp_seconds: number;
  formatted_timestamp: string;
  score: number;
  frame_url: string;
  thumbnail_url: string | null;
  source_type: string;
}

export interface SearchResponseData {
  query: string;
  results: SearchResultData[];
  count: number;
  search_time_ms: number;
  quota: {
    used: number;
    limit: number;
    remaining: number;
  };
}

export interface FolderData {
  folder_id: string;
  name: string;
  path: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
  video_count: number;
}

export interface DashboardData {
  total_videos: number;
  ready_videos: number;
  processing_videos: number;
  total_frames: number;
  total_searches: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_used_percentage: number;
}

export interface SearchHistoryItem {
  search_id: string;
  query: string;
  results_count: number;
  created_at: string;
}
