import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';

interface SegmentControlProps {
  segments: string[];
  activeIndex: number;
  onChange: (index: number) => void;
}

export default function SegmentControl({ segments, activeIndex, onChange }: SegmentControlProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {segments.map((label, i) => (
        <TouchableOpacity
          key={label}
          onPress={() => onChange(i)}
          style={[
            styles.segment,
            i === activeIndex && { backgroundColor: colors.surface },
          ]}
        >
          <Text
            style={[
              styles.label,
              { color: i === activeIndex ? colors.text : colors.textMid },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
  },
});
