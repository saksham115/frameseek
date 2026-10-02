import { create } from "zustand";

export interface WatchedRender {
  renderId: string;
  creationId: string;
  name: string;
}

/** Renders started in this session; ProcessingNotifier tells the user when each finishes. */
interface RenderWatchState {
  items: WatchedRender[];
  watch: (item: WatchedRender) => void;
  unwatch: (renderId: string) => void;
}

export const useRenderWatch = create<RenderWatchState>((set) => ({
  items: [],
  watch: (item) => set((s) => ({ items: [...s.items.filter((i) => i.renderId !== item.renderId), item] })),
  unwatch: (renderId) => set((s) => ({ items: s.items.filter((i) => i.renderId !== renderId) })),
}));
