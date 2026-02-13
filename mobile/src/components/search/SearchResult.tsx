import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import { STORAGE_BASE_URL } from '../../constants/config';
import type { SearchResultData } from '../../types/api.types';

interface SearchResultProps {
  result: SearchResultData;
  onPress: () => void;
}

const CARD_WIDTH = (Dimensions.get('window').width - Spacing.xl * 2 - Spacing.sm) / 2;

export default function SearchResult({ result, onPress }: SearchResultProps) {
  const { colors } = useTheme();
  const imageUrl = `${STORAGE_BASE_URL}/frames/${result.frame_url.replace('/storage/frames/', '')}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{result.video_title}</Text>
        <View style={styles.meta}>
          <Text style={[styles.timestamp, { color: colors.amber }]}>{result.formatted_timestamp}</Text>
          <Text style={[styles.score, { color: colors.textMid }]}>{Math.round(result.score * 100)}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: CARD_WIDTH * 0.6,
    backgroundColor: '#1A1A1E',
  },
  info: {
    padding: Spacing.sm,
  },
  title: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  timestamp: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
  },
  score: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
  },
});
