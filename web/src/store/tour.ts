import { create } from "zustand";

interface TourState {
  open: boolean;
  step: number;
  start: () => void;
  goTo: (step: number) => void;
  close: () => void;
}

/** First-visit product tour; auto-started once per account, replayable from Settings. */
export const useTour = create<TourState>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  goTo: (step) => set({ step }),
  close: () => set({ open: false }),
}));
