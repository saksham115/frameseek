export const Colors = {
  dark: {
    background: '#0A0A0B',
    surface: '#131315',
    surfaceRaised: '#1A1A1E',
    text: '#E8E4DD',
    textMid: 'rgba(232,228,221,0.50)',
    textDim: 'rgba(232,228,221,0.22)',
    amber: '#D4A053',
    amberDim: 'rgba(212,160,83,0.15)',
    border: 'rgba(255,255,255,0.06)',
    success: '#6EC87A',
    error: '#E06060',
  },
  light: {
    background: '#F5F3EF',
    surface: '#FFFFFF',
    surfaceRaised: '#EDEAE4',
    text: '#1A1A1E',
    textMid: 'rgba(26,26,30,0.55)',
    textDim: 'rgba(26,26,30,0.28)',
    amber: '#C08A30',
    amberDim: 'rgba(192,138,48,0.10)',
    border: 'rgba(10,10,11,0.07)',
    success: '#2D8A3E',
    error: '#C03030',
  },
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMid: string;
  textDim: string;
  amber: string;
  amberDim: string;
  border: string;
  success: string;
  error: string;
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  xxxl: 34,
} as const;

export const FontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  mono: 'JetBrainsMono_400Regular',
} as const;
