import { api } from "./client";

export interface DailyRow {
  day: string;
  signups: number;
  active: number;
  videos: number;
  hours: number;
  searches: number;
  ready: number;
  failed: number;
}

export interface AdminOverview {
  generated_at: string;
  start: string;
  end: string;
  days: number;
  geo_enabled: boolean;
  users: {
    total: number;
    new_in_range: number;
    new_7d: number;
    active_1d: number;
    active_7d: number;
    active_30d: number;
    deleted: number;
    terms_pending: number;
    unknown_country: number;
    with_videos: number;
    with_creations: number;
  };
  daily: DailyRow[];
  plans: { plan: string; users: number }[];
  countries: { code: string; users: number; active_30d: number; new_in_range: number }[];
  timezones: { tz: string; users: number }[];
  content: {
    videos: number;
    ready: number;
    in_progress: number;
    failed: number;
    failed_in_range: number;
    uploaded_in_range: number;
    hours: number;
    avg_minutes: number;
    transcribed: number;
    frames: number;
    avg_processing_minutes: number;
    storage_bytes: number;
    storage_limit_bytes: number;
  };
  searches: {
    total: number;
    in_range: number;
    searchers_in_range: number;
    avg_ms: number;
    zero_result_rate: number;
    quota_requests_in_range: number;
  };
  creations: { total: number; in_range: number; drafts: number; rendered: number };
  renders: {
    total: number;
    in_range: number;
    ready_in_range: number;
    failed_in_range: number;
    active: number;
    avg_seconds: number;
    minutes_rendered: number;
    hd: number;
    success_rate: number | null;
  };
  templates: { template_id: string; name: string; creations: number; rendered: number }[];
  formats: { format: string; creations: number }[];
  music: { stock: number; own: number; none: number };
  feedback: { total: number; in_range: number; by_category: { category: string; n: number }[] };
  deletions: { total: number; in_range: number; reasons: { reason: string; n: number }[] };
}

export interface AdminUserRow {
  user_id: string;
  email: string;
  name: string;
  plan_type: string;
  country_code: string | null;
  timezone: string | null;
  created_at: string;
  last_seen_at: string | null;
  storage_used_bytes: number;
  videos: number;
  searches: number;
  creations: number;
  renders: number;
}

export interface AdminEntry {
  email: string;
  source: "config" | "dashboard";
  added_by: string | null;
  created_at: string | null;
  name: string | null;
  last_seen_at: string | null;
  has_account: boolean;
}

export interface FeedbackRow {
  feedback_id: string;
  email: string | null;
  category: string;
  message: string;
  page: string | null;
  created_at: string;
}

export type OverviewRange = { days: number } | { from: string; to: string };

export async function getOverview(range: OverviewRange) {
  const { data } = await api.get<AdminOverview>("/admin/overview", { params: range });
  return data;
}

export async function getAdminUsers(params: { q?: string; sort?: string; page?: number }) {
  const { data } = await api.get<{ users: AdminUserRow[]; total: number; page: number; limit: number }>(
    "/admin/users",
    { params: { ...params, q: params.q?.trim() || undefined } },
  );
  return data;
}

export async function getFeedback(page: number) {
  const { data } = await api.get<{ feedback: FeedbackRow[]; total: number; page: number; limit: number }>(
    "/admin/feedback",
    { params: { page } },
  );
  return data;
}

export async function getAdmins() {
  const { data } = await api.get<{ admins: AdminEntry[] }>("/admin/admins");
  return data.admins;
}

export async function addAdmin(email: string) {
  const { data } = await api.post<{ admins: AdminEntry[] }>("/admin/admins", { email });
  return data.admins;
}

export async function removeAdmin(email: string) {
  const { data } = await api.delete<{ admins: AdminEntry[] }>(`/admin/admins/${encodeURIComponent(email)}`);
  return data.admins;
}
