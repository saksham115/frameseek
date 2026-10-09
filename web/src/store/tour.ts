import { create } from "zustand";

/** "main" is the first-visit product tour; "creations" walks through the Creations space. */
export type TourId = "main" | "creations";

interface TourState {
  open: boolean;
  tour: TourId;
  step: number;
  start: (tour?: TourId) => void;
  goTo: (step: number) => void;
  close: () => void;
}

/** Guided tours; each auto-starts once per account and is replayable from Settings. */
export const useTour = create<TourState>((set) => ({
  open: false,
  tour: "main",
  step: 0,
  start: (tour = "main") => set({ open: true, tour, step: 0 }),
  goTo: (step) => set({ step }),
  close: () => set({ open: false }),
}));
