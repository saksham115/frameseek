import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UIState {
  themePreference: 'light' | 'dark' | 'system';
  setThemePreference: (pref: 'light' | 'dark' | 'system') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      themePreference: 'dark',
      setThemePreference: (pref) => set({ themePreference: pref }),
    }),
    {
      name: 'frameseek-ui',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
