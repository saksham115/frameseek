import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';

interface TranscriptResultBadgeProps {
  text: string;
  timestamp: string;
  score: number;
  matchType?: string;
}

function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return `...${text.slice(0, maxLength)}...`;
}

export default function TranscriptResultBadge({ text, timestamp, score, matchType = 'semantic_audio' }: TranscriptResultBadgeProps) {
  const { colors } = useTheme();

  const isExact = matchType === 'exact';
  const badgeBg = isExact ? colors.success + '18' : colors.amberDim;
  const badgeBorder = isExact ? colors.success : colors.amber;
  const iconName = isExact ? 'checkmark-circle' : 'mic-outline';
  const iconColor = isExact ? colors.success : colors.amber;
  const metaText = isExact
    ? `${timestamp} · Exact`
    : `${timestamp} · ${Math.round(score * 100)}%`;

  return (
    <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
      <Ionicons name={iconName} size={14} color={iconColor} style={styles.icon} />
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
        "{truncateText(text)}"
      </Text>
      <Text style={[styles.meta, { color: colors.textMid }]}>
        {metaText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 4,
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
  },
  meta: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    flexShrink: 0,
  },
});
