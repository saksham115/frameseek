import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { useSearchStore } from '../../store/slices/searchSlice';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import SearchBar from '../../components/search/SearchBar';
import VideoSearchCard from '../../components/search/VideoSearchCard';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Chip from '../../components/common/Chip';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';
import type { AppStackParamList } from '../../types/navigation.types';
import type { SearchResultData } from '../../types/api.types';

interface GroupedVideo {
  videoId: string;
  videoTitle: string;
  results: SearchResultData[];
  topScore: number;
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const {
    query, setQuery, results, isSearching, searchTimeMs,
    performSearch, clearResults, history, fetchHistory,
  } = useSearchStore();
  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSearch = useCallback((text: string) => {
    if (text.trim().length >= 2) {
      performSearch(text);
    }
  }, [performSearch]);

  // Group results by video
  const groupedVideos = useMemo<GroupedVideo[]>(() => {
    const map = new Map<string, GroupedVideo>();
    for (const result of results) {
      const existing = map.get(result.video_id);
      if (existing) {
        existing.results.push(result);
        if (result.score > existing.topScore) existing.topScore = result.score;
      } else {
        map.set(result.video_id, {
          videoId: result.video_id,
          videoTitle: result.video_title,
          results: [result],
          topScore: result.score,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.topScore - a.topScore);
  }, [results]);

  const handleVideoPress = (group: GroupedVideo) => {
    navigation.navigate('VideoDetail', {
      videoId: group.videoId,
      searchQuery: query,
      searchResults: group.results,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <FrameSeekIcon size={24} />
          <Text style={[styles.title, { color: colors.text }]}>Search</Text>
        </View>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSearch}
          autoFocus
          onClear={clearResults}
        />
        {results.length > 0 && (
          <Text style={[styles.meta, { color: colors.textMid }]}>
            {results.length} results across {groupedVideos.length} {groupedVideos.length === 1 ? 'video' : 'videos'} in {(searchTimeMs / 1000).toFixed(1)}s ({searchTimeMs}ms)
          </Text>
        )}
      </View>

      {isSearching ? (
        <LoadingSpinner />
      ) : groupedVideos.length > 0 ? (
        <FlatList
          data={groupedVideos}
          keyExtractor={(item) => item.videoId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <VideoSearchCard
              videoTitle={item.videoTitle}
              results={item.results}
              onPress={() => handleVideoPress(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : query.length === 0 && history.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={[styles.historyTitle, { color: colors.textMid }]}>Recent Searches</Text>
          <View style={styles.chips}>
            {history.slice(0, 8).map((item) => (
              <Chip key={item.search_id} label={item.query} onPress={() => setQuery(item.query)} />
            ))}
          </View>
        </View>
      ) : query.length > 0 && !isSearching ? (
        <EmptyState icon="search" title="No results" message={`No frames match "${query}"`} />
      ) : (
        <EmptyState icon="search" title="Search your videos" message="Describe what you're looking for" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.xl, paddingTop: Spacing.xxxl + 20, gap: Spacing.sm },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl },
  meta: { fontFamily: FontFamily.regular, fontSize: FontSize.xs },
  list: { padding: Spacing.xl, paddingTop: 0 },
  separator: { height: Spacing.sm },
  historySection: { padding: Spacing.xl },
  historyTitle: { fontFamily: FontFamily.medium, fontSize: FontSize.sm, marginBottom: Spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
