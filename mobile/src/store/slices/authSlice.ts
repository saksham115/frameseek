import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { authApi } from '../../services/api';
import { useSubscriptionStore } from './subscriptionSlice';
import type { UserData } from '../../types/api.types';

interface AuthState {
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tosAccepted: boolean;

  googleSignIn: (idToken: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setUser: (user: UserData) => void;
  acceptTos: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  tosAccepted: false,

  googleSignIn: async (idToken, name) => {
    const response = await authApi.googleSignIn(idToken, name);
    const { user, tokens } = response.data.data;
    await SecureStore.setItemAsync('access_token', tokens.access_token);
    await SecureStore.setItemAsync('refresh_token', tokens.refresh_token);
    const tosAccepted = !!user.tos_accepted_at;
    if (tosAccepted) {
      await SecureStore.setItemAsync('tos_accepted', 'true');
    } else {
      await SecureStore.deleteItemAsync('tos_accepted');
    }
    set({ user, isAuthenticated: true, tosAccepted });
    useSubscriptionStore.getState().initialize();
  },

  logout: async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {}
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('tos_accepted');
    set({ user: null, isAuthenticated: false, tosAccepted: false });
    useSubscriptionStore.getState().reset();
  },

  restoreSession: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const tosAccepted = (await SecureStore.getItemAsync('tos_accepted')) === 'true';
      set({ isAuthenticated: true, isLoading: false, tosAccepted });

      // Fetch user profile in background
      try {
        const res = await authApi.getMe();
        const user = res.data.data;
        const freshTos = !!user.tos_accepted_at;
        if (freshTos) {
          await SecureStore.setItemAsync('tos_accepted', 'true');
        }
        set({ user, tosAccepted: freshTos });
        useSubscriptionStore.getState().initialize();
      } catch {
        // Token may be expired — interceptor will handle refresh or logout
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({ user }),

  acceptTos: async () => {
    const response = await authApi.acceptTos();
    const updatedUser = response.data.data;
    await SecureStore.setItemAsync('tos_accepted', 'true');
    set({ user: updatedUser, tosAccepted: true });
  },
}));
