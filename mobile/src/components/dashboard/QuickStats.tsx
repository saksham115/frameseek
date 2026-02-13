import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import type { DashboardData } from '../../types/api.types';

interface QuickStatsProps {
  data: DashboardData | null;
}

export default function QuickStats({ data }: QuickStatsProps) {
  const { colors } = useTheme();

  const stats = [
    { label: 'Videos', value: data?.total_videos ?? 0, color: colors.amber },
    { label: 'Ready', value: data?.ready_videos ?? 0, color: colors.success },
    { label: 'Frames', value: data?.total_frames ?? 0, color: colors.text },
    { label: 'Searches', value: data?.total_searches ?? 0, color: colors.textMid },
  ];

  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.value, { color: stat.color }]}>{stat.value}</Text>
          <Text style={[styles.label, { color: colors.textMid }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  value: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
  },
  label: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
});
