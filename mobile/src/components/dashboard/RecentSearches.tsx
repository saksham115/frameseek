import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { formatTimeAgo } from '../../utils/formatting';
import type { SearchHistoryItem } from '../../types/api.types';

interface RecentSearchesProps {
  searches: SearchHistoryItem[];
  onSearchPress: (query: string) => void;
}

export default function RecentSearches({ searches, onSearchPress }: RecentSearchesProps) {
  const { colors } = useTheme();

  if (searches.length === 0) return null;

  return (
    <View style={styles.container}>
      {searches.map((item) => (
        <TouchableOpacity
          key={item.search_id}
          onPress={() => onSearchPress(item.query)}
          style={[styles.item, { borderColor: colors.border }]}
        >
          <Ionicons name="time" size={16} color={colors.textDim} />
          <Text style={[styles.query, { color: colors.text }]} numberOfLines={1}>{item.query}</Text>
          <Text style={[styles.count, { color: colors.textMid }]}>{item.results_count}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  query: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, flex: 1 },
  count: { fontFamily: FontFamily.regular, fontSize: FontSize.xs },
});
