import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, Image, TouchableOpacity, Keyboard, ActionSheetIOS, Platform } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { videosApi, searchApi, clipsApi } from '../../services/api';
import { STORAGE_BASE_URL } from '../../constants/config';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import SearchBar from '../../components/search/SearchBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { formatDuration, formatFileSize, formatTimeAgo } from '../../utils/formatting';
import { useFocusEffect } from '@react-navigation/native';
import type { VideoDetailScreenProps } from '../../types/navigation.types';
import type { ClipData, SearchResultData, VideoData } from '../../types/api.types';

export default function VideoDetailScreen({ route, navigation }: VideoDetailScreenProps) {
  const { videoId, searchQuery: incomingQuery, searchResults: incomingResults } = route.params;
  const { colors } = useTheme();
  const [video, setVideo] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(incomingQuery ?? '');
  const [searchResults, setSearchResults] = useState<SearchResultData[]>(incomingResults ?? []);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!(incomingResults && incomingResults.length > 0));
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [clips, setClips] = useState<ClipData[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<TextInput>(null);
  const videoRef = useRef<Video>(null);
  const scrollRef = useRef<ScrollView>(null);
  const videoPlayerY = useRef(0);

  const loadData = useCallback(async () => {
    try {
      const [videoRes, clipsRes] = await Promise.all([
        videosApi.get(videoId),
        clipsApi.list({ video_id: videoId, limit: 50 }),
      ]);
      setVideo(videoRes.data.data.video);
      setClips(clipsRes.data.data.clips);
    } catch {} finally {
      setLoading(false);
    }
  }, [videoId]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessing = video?.status === 'processing' || video?.status === 'queued';

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Poll while processing
  useEffect(() => {
    if (isProcessing) {
      pollRef.current = setInterval(() => loadData(), 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isProcessing]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await searchApi.search({ query, video_ids: [videoId], top_k: 20 });
      setSearchResults(res.data.data.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [videoId]);

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!text.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    searchTimeout.current = setTimeout(() => handleSearch(text), 500);
  };

  const handleFrameTap = async (result: SearchResultData) => {
    setSelectedFrameId(result.frame_id);
    Keyboard.dismiss();

    // Scroll to the video player
    scrollRef.current?.scrollTo({ y: videoPlayerY.current, animated: true });

    // Seek to the timestamp and play
    if (videoRef.current) {
      try {
        await videoRef.current.setPositionAsync(result.timestamp_seconds * 1000, {
          toleranceMillisBefore: 0,
          toleranceMillisAfter: 0,
        });
        await videoRef.current.playAsync();
      } catch {}
    }
  };

  const getVideoUri = () => {
    if (video?.video_url) return `${STORAGE_BASE_URL}${video.video_url.replace('/storage', '')}`;
    if (video?.local_uri) return video.local_uri;
    return '';
  };

  const handleGenerateClip = (result: SearchResultData) => {
    const action = () => {
      navigation.navigate('ClipGenerate', {
        videoId,
        timestamp: result.timestamp_seconds,
        frameId: result.frame_id,
        videoTitle: video?.title || 'Video',
        videoDuration: video?.duration_seconds ?? 60,
        videoUri: getVideoUri(),
      });
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Generate Clip'], cancelButtonIndex: 0 },
        (index) => { if (index === 1) action(); },
      );
    } else {
      Alert.alert('Actions', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate Clip', onPress: action },
      ]);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await videosApi.process(videoId);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to start processing');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Video', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await videosApi.delete(videoId);
            navigation.goBack();
          } catch {}
        },
      },
    ]);
  };

  const handleTitleTap = () => {
    if (video) {
      setEditTitle(video.title);
      setIsEditingTitle(true);
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  };

  const handleTitleSave = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed || !video || trimmed === video.title) {
      setIsEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await videosApi.update(videoId, { title: trimmed });
      setVideo(res.data.data.video);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to update title');
    } finally {
      setSavingTitle(false);
      setIsEditingTitle(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!video) return <EmptyState icon="alert-circle" title="Not found" message="Video not found" />;

  const statusVariant =
    video.status === 'ready' ? 'success' :
    video.status === 'error' ? 'error' :
    video.status === 'processing' || video.status === 'queued' ? 'amber' :
    'default';

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Search within video — top */}
      {video.status === 'ready' && (
        <View style={styles.searchSection}>
          <SearchBar
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search in this video..."
            onClear={() => { setSearchResults([]); setHasSearched(false); setSelectedFrameId(null); }}
          />
        </View>
      )}

      {/* Video player — prefer server URL (survives app/server restart) over local_uri (may be stale) */}
      <View onLayout={(e) => { videoPlayerY.current = e.nativeEvent.layout.y; }}>
        {(video.video_url || video.local_uri) ? (
          <Video
            ref={videoRef}
            source={{ uri: video.video_url ? `${STORAGE_BASE_URL}${video.video_url.replace('/storage', '')}` : video.local_uri! }}
            style={styles.videoPlayer}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
          />
        ) : (
          <View style={[styles.playerPlaceholder, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="videocam-off-outline" size={48} color={colors.textDim} />
            <Text style={[styles.durationOverlay, { color: colors.textMid }]}>Video not available</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.titleRow}>
          {isEditingTitle ? (
            <TextInput
              ref={titleInputRef}
              value={editTitle}
              onChangeText={setEditTitle}
              onBlur={handleTitleSave}
              onSubmitEditing={handleTitleSave}
              style={[styles.titleInput, { color: colors.text, borderColor: colors.amber, flex: 1 }]}
              returnKeyType="done"
              maxLength={500}
              autoFocus
              editable={!savingTitle}
            />
          ) : (
            <Text style={[styles.title, { color: colors.text, flex: 1 }]}>{video.title}</Text>
          )}
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={16} color={colors.textMid} />
          </TouchableOpacity>
        </View>
        <View style={styles.metaRow}>
          <Badge label={video.status} variant={statusVariant} />
          <Text style={[styles.meta, { color: colors.textMid }]}>{formatFileSize(video.file_size_bytes)}</Text>
          {video.width && video.height && (
            <Text style={[styles.meta, { color: colors.textMid }]}>{video.width}x{video.height}</Text>
          )}
          <Text style={[styles.meta, { color: colors.textMid }]}>{formatTimeAgo(video.created_at)}</Text>
          {!isEditingTitle && (
            <TouchableOpacity onPress={handleTitleTap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={13} color={colors.textMid} />
            </TouchableOpacity>
          )}
        </View>
        {video.codec && (
          <Text style={[styles.codec, { color: colors.textDim }]}>Codec: {video.codec} | FPS: {Math.round(video.fps ?? 0)}</Text>
        )}
      </View>

      {/* Actions */}
      {video.status === 'uploaded' && (
        <View style={styles.actions}>
          <Button title="Process Video" onPress={handleProcess} loading={processing} />
        </View>
      )}

      {/* Search results */}
      {video.status === 'ready' && (
        <View style={styles.resultsSection}>
          {searching && (
            <View style={styles.searchLoading}>
              <LoadingSpinner />
            </View>
          )}

          {!searching && hasSearched && searchResults.length === 0 && (
            <Text style={[styles.noResults, { color: colors.textMid }]}>No matching frames found</Text>
          )}

          {searchResults.length > 0 && (
            <View style={styles.resultsGrid}>
              {searchResults.map((result) => {
                const isSelected = selectedFrameId === result.frame_id;
                return (
                  <TouchableOpacity
                    key={result.frame_id}
                    activeOpacity={0.8}
                    onPress={() => handleFrameTap(result)}
                    style={[
                      styles.resultCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isSelected ? colors.amber : colors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    {isSelected && (
                      <View style={[styles.playingBadge, { backgroundColor: colors.amber }]}>
                        <Ionicons name="play" size={8} color="#fff" />
                        <Text style={styles.playingText}>Playing</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.moreBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => handleGenerateClip(result)}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
                    </TouchableOpacity>
                    <Image
                      source={{ uri: `${STORAGE_BASE_URL}/frames/${(result.frame_url || '').replace('/storage/frames/', '')}` }}
                      style={styles.resultImage}
                      resizeMode="cover"
                    />
                    <View style={styles.resultInfo}>
                      <Text style={[styles.resultTime, { color: isSelected ? colors.amber : colors.textMid }]}>
                        {result.formatted_timestamp}
                      </Text>
                      <Text style={[styles.resultScore, { color: colors.textDim }]}>
                        {Math.round(result.score * 100)}% match
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Clips section */}
      {!hasSearched && clips.length > 0 && (
        <View style={styles.clipsSection}>
          <Text style={[styles.clipsSectionTitle, { color: colors.text }]}>Clips</Text>
          <View style={styles.clipsGrid}>
            {clips.map((clip) => (
              <TouchableOpacity
                key={clip.clip_id}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ClipDetail', { clipId: clip.clip_id })}
                style={[styles.clipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.clipThumb, { backgroundColor: colors.surfaceRaised }]}>
                  {clip.thumbnail_url ? (
                    <Image source={{ uri: `${STORAGE_BASE_URL}${clip.thumbnail_url.replace('/storage', '')}` }} style={styles.clipThumbImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="film-outline" size={24} color={colors.amber} />
                  )}
                  <View style={styles.clipDuration}>
                    <Text style={styles.clipDurationText}>{formatDuration(clip.duration_seconds)}</Text>
                  </View>
                </View>
                <View style={styles.clipInfo}>
                  <Text style={[styles.clipTitle, { color: colors.text }]} numberOfLines={2}>{clip.title}</Text>
                  <Text style={[styles.clipMeta, { color: colors.textMid }]}>{formatTimeAgo(clip.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Spacing.xxxl },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  playerPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationOverlay: { fontFamily: FontFamily.mono, fontSize: FontSize.sm, marginTop: Spacing.sm },
  info: { padding: Spacing.xl, gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xl },
  titleInput: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    borderBottomWidth: 1.5,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  iconBtn: { paddingTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  meta: { fontFamily: FontFamily.regular, fontSize: FontSize.xs },
  codec: { fontFamily: FontFamily.mono, fontSize: FontSize.xs },
  searchSection: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  resultsSection: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  searchLoading: { height: 60, justifyContent: 'center' },
  noResults: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  resultCard: {
    width: '48%',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  playingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  playingText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: 9,
  },
  resultImage: {
    width: '100%',
    height: 90,
    backgroundColor: '#1A1A1E',
  },
  resultInfo: {
    padding: Spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultTime: { fontFamily: FontFamily.mono, fontSize: FontSize.xs },
  resultScore: { fontFamily: FontFamily.regular, fontSize: 10 },
  actions: { padding: Spacing.xl, gap: Spacing.sm },
  moreBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipsSection: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.md },
  clipsSectionTitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.lg },
  clipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  clipCard: {
    width: '48%',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  clipThumb: {
    width: '100%',
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipThumbImage: {
    width: '100%',
    height: '100%',
  },
  clipDuration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  clipDurationText: {
    color: '#fff',
    fontFamily: FontFamily.mono,
    fontSize: 10,
  },
  clipInfo: { padding: Spacing.xs, gap: 2 },
  clipTitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs },
  clipMeta: { fontFamily: FontFamily.regular, fontSize: 10 },
});
