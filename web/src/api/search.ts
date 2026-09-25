import { api } from "./client";
import type { SearchMatch } from "./types";

export interface SearchQuota {
  used: number;
  /** -1 means unlimited. */
  limit: number;
  remaining: number;
  resets_at: string | null;
}

export interface SearchResult {
  matches: SearchMatch[];
  quota: SearchQuota | null;
}

export async function searchWithQuota(
  query: string,
  videoId?: string,
  topK = 20,
): Promise<SearchResult> {
  const { data } = await api.post<{
    results: SearchMatch[];
    quota?: SearchQuota;
  }>("/search", {
    query,
    video_ids: videoId ? [videoId] : undefined,
    top_k: topK,
  });
  return {
    matches: (data.results ?? []).map((m) => ({
      ...m,
      timestamp_seconds: Number(m.timestamp_seconds),
    })),
    quota: data.quota ?? null,
  };
}

export async function search(query: string, videoId?: string): Promise<SearchMatch[]> {
  return (await searchWithQuota(query, videoId)).matches;
}

export async function getSearchQuota(): Promise<SearchQuota> {
  const { data } = await api.get<SearchQuota>("/search/quota");
  return data;
}

export interface SearchHistoryItem {
  search_id: string;
  query: string;
  results_count: number;
  created_at: string;
}

export async function getSearchHistory(limit = 30): Promise<SearchHistoryItem[]> {
  const { data } = await api.get<{ history: SearchHistoryItem[] }>(
    "/search/history",
    { params: { limit } },
  );
  return data.history ?? [];
}
