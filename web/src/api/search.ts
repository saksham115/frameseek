import { api } from "./client";
import type { SearchMatch } from "./types";

export async function search(query: string, videoId?: string): Promise<SearchMatch[]> {
  const { data } = await api.post<{ results: SearchMatch[] }>("/search", {
    query,
    video_ids: videoId ? [videoId] : undefined,
    top_k: 20,
  });
  return data.results ?? [];
}
