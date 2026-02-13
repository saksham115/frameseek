import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import { useVideosStore } from '../../store/slices/videosSlice';
import VideoCard from '../../components/video/VideoCard';
import SegmentControl from '../../components/common/SegmentControl';
import FAB from '../../components/common/FAB';
import EmptyState from '../../components/common/EmptyState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import type { AppStackParamList } from '../../types/navigation.types';

const SEGMENTS = ['All', 'Processing', 'Ready'];
const FILTER_MAP = ['all', 'processing', 'ready'] as const;

export default function VideosScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { videos, isLoading, fetchVideos, activeFilter, setActiveFilter, deleteVideo } = useVideosStore();
  const [refreshing, setRefreshing] = useState(false);

  const segmentIndex = FILTER_MAP.indexOf(activeFilter);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasProcessing = videos.some((v) => v.status === 'processing' || v.status === 'queued');

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchVideos();
    }, [activeFilter]),
  );

  // Poll while any video is processing
  useEffect(() => {
    if (hasProcessing) {
      pollRef.current = setInterval(() => fetchVideos(), 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasProcessing]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVideos();
    setRefreshing(false);
  };

  const handleSegmentChange = (index: number) => {
    setActiveFilter(FILTER_MAP[index]);
  };

  const handleDelete = (videoId: string, title: string) => {
    Alert.alert(
      'Delete Video',
      `Are you sure you want to delete "${title}"? This will remove the video, all extracted frames, and embeddings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteVideo(videoId) },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Videos</Text>
        <SegmentControl segments={SEGMENTS} activeIndex={segmentIndex} onChange={handleSegmentChange} />
      </View>

      {isLoading && videos.length === 0 ? (
        <LoadingSpinner />
      ) : videos.length === 0 ? (
        <EmptyState
          icon="videocam-off"
          title="No videos yet"
          message="Upload your first video to get started"
          actionLabel="Upload Video"
          onAction={() => navigation.navigate('Upload')}
        />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.video_id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
          renderItem={({ item }) => (
            <VideoCard
              video={item}
              onPress={() => navigation.navigate('VideoDetail', { videoId: item.video_id })}
              onDelete={() => handleDelete(item.video_id, item.title)}
            />
          )}
        />
      )}

      <FAB icon="cloud-upload" onPress={() => navigation.navigate('Upload')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.xl, paddingTop: Spacing.xxxl + 20, gap: Spacing.md },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl },
  list: { padding: Spacing.xl, paddingTop: 0 },
});
