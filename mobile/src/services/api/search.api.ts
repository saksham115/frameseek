import type { ApiResponse, SearchHistoryItem, SearchResponseData } from '../../types/api.types';
import apiClient from './client';

export const searchApi = {
  search: (data: {
    query: string;
    top_k?: number;
    video_ids?: string[];
    source_filter?: string;
    min_score?: number;
  }) => apiClient.post<ApiResponse<SearchResponseData>>('/search', data),

  history: (limit?: number) =>
    apiClient.get<ApiResponse<{ history: SearchHistoryItem[] }>>('/search/history', {
      params: { limit },
    }),

  quota: () =>
    apiClient.get<ApiResponse<{ used: number; limit: number; remaining: number }>>(
      '/search/quota'
    ),
};
