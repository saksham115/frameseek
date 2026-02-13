import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius } from '../../constants/theme';

interface ProgressBarProps {
  progress: number; // 0-100
  height?: number;
}

export default function ProgressBar({ progress, height = 6 }: ProgressBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.track, { height, backgroundColor: colors.surfaceRaised }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: colors.amber,
            height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.full,
  },
});
