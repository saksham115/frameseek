import { create } from 'zustand';
import { videosApi } from '../../services/api';
import type { Pagination, VideoData } from '../../types/api.types';

interface VideosState {
  videos: VideoData[];
  pagination: Pagination | null;
  isLoading: boolean;
  error: string | null;
  viewMode: 'list' | 'grid';
  activeFilter: 'all' | 'processing' | 'ready';

  fetchVideos: (params?: Record<string, any>) => Promise<void>;
  setViewMode: (mode: 'list' | 'grid') => void;
  setActiveFilter: (filter: 'all' | 'processing' | 'ready') => void;
  deleteVideo: (videoId: string) => Promise<void>;
}

export const useVideosStore = create<VideosState>((set, get) => ({
  videos: [],
  pagination: null,
  isLoading: false,
  error: null,
  viewMode: 'list',
  activeFilter: 'all',

  fetchVideos: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const filter = get().activeFilter;
      const queryParams = {
        ...params,
        ...(filter !== 'all' && { status: filter }),
      };
      const response = await videosApi.list(queryParams);
      set({
        videos: response.data.data.videos,
        pagination: response.data.data.pagination,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),

  deleteVideo: async (videoId) => {
    await videosApi.delete(videoId);
    set((state) => ({
      videos: state.videos.filter((v) => v.video_id !== videoId),
    }));
  },
}));
