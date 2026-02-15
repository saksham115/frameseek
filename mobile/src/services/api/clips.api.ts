import type { ApiResponse, ClipData, Pagination } from '../../types/api.types';
import apiClient from './client';

export const clipsApi = {
  create: (data: {
    video_id: string;
    title: string;
    start_time: number;
    end_time: number;
    source_timestamp?: number;
    source_frame_id?: string;
  }) =>
    apiClient.post<ApiResponse<ClipData>>('/clips', data),

  list: (params?: { video_id?: string; page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<{ clips: ClipData[]; pagination: Pagination }>>(
      '/clips',
      { params },
    ),

  get: (clipId: string) =>
    apiClient.get<ApiResponse<ClipData>>(`/clips/${clipId}`),

  delete: (clipId: string) => apiClient.delete(`/clips/${clipId}`),
};
