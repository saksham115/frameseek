import type { ApiResponse, FrameData, Pagination, VideoData } from '../../types/api.types';
import apiClient from './client';

export const videosApi = {
  list: (params?: {
    folder_id?: string;
    status?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
  }) =>
    apiClient.get<ApiResponse<{ videos: VideoData[]; pagination: Pagination }>>(
      '/videos',
      { params }
    ),

  get: (videoId: string) =>
    apiClient.get<ApiResponse<{ video: VideoData; frames_count: number; job: any }>>(
      `/videos/${videoId}`
    ),

  upload: (formData: FormData) =>
    apiClient.post<ApiResponse<{ video: VideoData; job: any }>>('/videos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 min for uploads
    }),

  update: (videoId: string, data: { title?: string; description?: string }) =>
    apiClient.patch<ApiResponse<{ video: VideoData; frames_count: number; job: any }>>(
      `/videos/${videoId}`,
      data
    ),

  delete: (videoId: string) => apiClient.delete(`/videos/${videoId}`),

  process: (videoId: string, data?: { frame_interval?: number; priority?: number }) =>
    apiClient.post(`/videos/${videoId}/process`, data),

  listFrames: (videoId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<{ frames: FrameData[]; pagination: Pagination }>>(
      `/videos/${videoId}/frames`,
      { params }
    ),
};
