import { create } from 'zustand';
import { searchApi } from '../../services/api';
import type { SearchHistoryItem, SearchResultData } from '../../types/api.types';

interface SearchState {
  query: string;
  results: SearchResultData[];
  isSearching: boolean;
  searchTimeMs: number;
  history: SearchHistoryItem[];
  error: string | null;

  setQuery: (query: string) => void;
  performSearch: (query: string) => Promise<void>;
  fetchHistory: () => Promise<void>;
  clearResults: () => void;
}

let searchCounter = 0;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  searchTimeMs: 0,
  history: [],
  error: null,

  setQuery: (query) => set({ query }),

  performSearch: async (query) => {
    if (!query.trim() || query.trim().length < 3) {
      set({ results: [], searchTimeMs: 0, isSearching: false });
      return;
    }
    const requestId = ++searchCounter;
    set({ isSearching: true, error: null });
    try {
      const response = await searchApi.search({
        query,
        top_k: 20,
      });
      // Only apply results if this is still the latest request
      if (requestId === searchCounter) {
        set({
          results: response.data.data.results,
          searchTimeMs: response.data.data.search_time_ms,
          isSearching: false,
        });
      }
    } catch (err: any) {
      if (requestId === searchCounter) {
        set({ error: err.message, isSearching: false });
      }
    }
  },

  fetchHistory: async () => {
    try {
      const response = await searchApi.history(20);
      set({ history: response.data.data.history });
    } catch {}
  },

  clearResults: () => {
    searchCounter++;
    set({ results: [], query: '', searchTimeMs: 0, isSearching: false });
  },
}));
