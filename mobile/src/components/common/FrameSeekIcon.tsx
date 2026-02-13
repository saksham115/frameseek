import React from 'react';
import Svg, { Rect, Path, Polygon } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';

interface FrameSeekIconProps {
  size?: number;
}

export default function FrameSeekIcon({ size = 32 }: FrameSeekIconProps) {
  const { isDark } = useTheme();

  // Brand kit: dark bg → amber fill (#D4A053) + dark strokes (#0A0A0B)
  // light bg → deeper amber (#C08A30) + light strokes (#F5F3EF)
  const fillColor = isDark ? '#D4A053' : '#C08A30';
  const strokeColor = isDark ? '#0A0A0B' : '#F5F3EF';

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect x="4" y="4" width="40" height="40" rx="10" fill={fillColor} />
      {/* Corner brackets — 8px inset from rect edges, centered */}
      <Path
        d="M12 16L12 12L16 12"
        stroke={strokeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M32 12L36 12L36 16"
        stroke={strokeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M36 32L36 36L32 36"
        stroke={strokeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 36L12 36L12 32"
        stroke={strokeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Play triangle — centroid at (24, 24) */}
      <Polygon points="20,17 20,31 32,24" fill={strokeColor} />
    </Svg>
  );
}
