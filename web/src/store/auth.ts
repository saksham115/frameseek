import { create } from "zustand";
import { api } from "@/api/client";
import { mapUser, type User } from "@/api/types";

interface AuthState {
  user: User | null;
  status: "loading" | "authenticated" | "anonymous";
  loadSession: () => Promise<void>;
  logout: () => Promise<void>;
  setAnonymous: () => void;
  setUser: (user: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  loadSession: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: mapUser(data), status: "authenticated" });
    } catch {
      set({ user: null, status: "anonymous" });
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      set({ user: null, status: "anonymous" });
    }
  },

  // Called by the API client when a token refresh fails terminally.
  setAnonymous: () => set({ user: null, status: "anonymous" }),
  setUser: (user) => set({ user, status: "authenticated" }),
}));
