import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'error' | 'amber';
}

export default function Badge({ label, variant = 'default' }: BadgeProps) {
  const { colors } = useTheme();

  const bgMap = {
    default: colors.surfaceRaised,
    success: colors.success + '22',
    error: colors.error + '22',
    amber: colors.amberDim,
  };

  const textMap = {
    default: colors.textMid,
    success: colors.success,
    error: colors.error,
    amber: colors.amber,
  };

  return (
    <View style={[styles.badge, { backgroundColor: bgMap[variant] }]}>
      <Text style={[styles.text, { color: textMap[variant] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
  },
});
