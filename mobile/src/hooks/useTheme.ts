import { useColorScheme } from 'react-native';
import { Colors, type ThemeColors } from '../constants/theme';
import { useUIStore } from '../store/slices/uiSlice';

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const systemScheme = useColorScheme();
  const themePreference = useUIStore((s) => s.themePreference);

  const isDark =
    themePreference === 'system'
      ? systemScheme === 'dark'
      : themePreference === 'dark';

  return {
    colors: isDark ? Colors.dark : Colors.light,
    isDark,
  };
}
