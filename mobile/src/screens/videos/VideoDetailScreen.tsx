import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, Image, TouchableOpacity, Keyboard, ActionSheetIOS, Platform } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { videosApi, searchApi, clipsApi } from '../../services/api';
import Button from '../../components/common/Button';
import { resolveMediaUrl } from '../../utils/url';
import Badge from '../../components/common/Badge';
import SearchBar from '../../components/search/SearchBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { formatDuration, formatFileSize, formatTimeAgo } from '../../utils/formatting';
import { useFocusEffect } from '@react-navigation/native';
import type { VideoDetailScreenProps } from '../../types/navigation.types';
import type { ClipData, SearchResultData, TranscriptSegmentData, VideoData } from '../../types/api.types';

export default function VideoDetailScreen({ route, navigation }: VideoDetailScreenProps) {
  const { videoId, searchQuery: incomingQuery, searchResults: incomingResults } = route.params;
  const { colors } = useTheme();
  const [video, setVideo] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [retryingTranscript, setRetryingTranscript] = useState(false);
  const [searchQuery, setSearchQuery] = useState(incomingQuery ?? '');
  const [searchResults, setSearchResults] = useState<SearchResultData[]>(incomingResults ?? []);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!(incomingResults && incomingResults.length > 0));
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [clips, setClips] = useState<ClipData[]>([]);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegmentData[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [currentPositionSec, setCurrentPositionSec] = useState(0);
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

  // Auto-fetch transcript segments when video has a transcript (for viewer highlighting)
  useEffect(() => {
    if (video?.has_transcript && transcriptSegments.length === 0) {
      videosApi.getTranscript(videoId)
        .then((res) => setTranscriptSegments(res.data.data.segments))
        .catch(() => {});
    }
  }, [video?.has_transcript]);

  // Find the active segment for the current playback position (transcript highlight)
  const activeSegment = useMemo(() => {
    if (transcriptSegments.length === 0) return null;
    return transcriptSegments.find(
      (seg) => currentPositionSec >= seg.start_seconds && currentPositionSec <= seg.end_seconds
    ) ?? null;
  }, [transcriptSegments, currentPositionSec]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.positionMillis != null) {
      setCurrentPositionSec(status.positionMillis / 1000);
    }
  }, []);

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
    if (!text.trim()) {
      setSearchResults([]);
      setHasSearched(false);
    }
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
    if (video?.video_url) return resolveMediaUrl(video.video_url) ?? '';
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

  const handleRetryTranscript = async () => {
    setRetryingTranscript(true);
    try {
      await videosApi.retryTranscript(videoId);
      Alert.alert('Transcript', 'Transcription has been queued. It will process in the background.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to start transcription');
    } finally {
      setRetryingTranscript(false);
    }
  };

  const handleToggleTranscript = async () => {
    if (transcriptExpanded) {
      setTranscriptExpanded(false);
      return;
    }
    // Fetch transcript if not yet loaded
    if (transcriptSegments.length === 0) {
      setLoadingTranscript(true);
      try {
        const res = await videosApi.getTranscript(videoId);
        setTranscriptSegments(res.data.data.segments);
      } catch {
        Alert.alert('Error', 'Failed to load transcript');
        return;
      } finally {
        setLoadingTranscript(false);
      }
    }
    setTranscriptExpanded(true);
  };

  const handleTranscriptSegmentTap = async (segment: TranscriptSegmentData) => {
    scrollRef.current?.scrollTo({ y: videoPlayerY.current, animated: true });
    if (videoRef.current) {
      try {
        await videoRef.current.setPositionAsync(segment.start_seconds * 1000, {
          toleranceMillisBefore: 0,
          toleranceMillisAfter: 0,
        });
        await videoRef.current.playAsync();
      } catch {}
    }
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
            onSubmit={(text) => handleSearch(text)}
            placeholder="Search in this video..."
            onClear={() => { setSearchResults([]); setHasSearched(false); setSelectedFrameId(null); }}
          />
        </View>
      )}

      {/* Video player */}
      <View onLayout={(e) => { videoPlayerY.current = e.nativeEvent.layout.y; }}>
        {video.video_url ? (
          <Video
            ref={videoRef}
            source={{ uri: resolveMediaUrl(video.video_url)! }}
            style={styles.videoPlayer}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            progressUpdateIntervalMillis={250}
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

      {/* Transcript status */}
      {video.status === 'ready' && (
        <View style={styles.transcriptSection}>
          <TouchableOpacity
            onPress={video.has_transcript ? handleToggleTranscript : undefined}
            activeOpacity={video.has_transcript ? 0.7 : 1}
            style={styles.transcriptHeaderRow}
          >
            <View style={styles.transcriptHeader}>
              <Ionicons name="mic-outline" size={16} color={colors.textMid} />
              <Text style={[styles.transcriptTitle, { color: colors.text }]}>Audio Transcript</Text>
            </View>
            {video.has_transcript && (
              <Ionicons
                name={transcriptExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMid}
              />
            )}
          </TouchableOpacity>
          {video.has_transcript ? (
            <View style={styles.transcriptInfo}>
              <Badge label="Transcribed" variant="success" />
              {video.transcript_language && (
                <Text style={[styles.meta, { color: colors.textMid }]}>
                  {video.transcript_language.toUpperCase()}
                </Text>
              )}
              {video.transcript_segment_count != null && (
                <Text style={[styles.meta, { color: colors.textMid }]}>
                  {video.transcript_segment_count} segments
                </Text>
              )}
            </View>
          ) : video.transcript_status === 'failed' ? (
            <View style={styles.transcriptInfo}>
              <Badge label="Failed" variant="error" />
              <Text style={[styles.meta, { color: colors.textMid }]} numberOfLines={1}>
                {video.transcript_error || 'Transcription failed'}
              </Text>
            </View>
          ) : video.transcript_status === 'skipped' ? (
            <View style={styles.transcriptInfo}>
              <Badge label="Skipped" variant="default" />
              <Text style={[styles.meta, { color: colors.textMid }]}>No audio track detected</Text>
            </View>
          ) : video.transcript_status === 'processing' ? (
            <View style={styles.transcriptInfo}>
              <Badge label="Processing" variant="amber" />
              <Text style={[styles.meta, { color: colors.textMid }]}>Transcribing audio...</Text>
            </View>
          ) : (
            <View style={styles.transcriptInfo}>
              <Badge label="Pending" variant="default" />
              <Text style={[styles.meta, { color: colors.textMid }]}>Not yet transcribed</Text>
            </View>
          )}
          {video.transcript_status === 'failed' && (
            <Button
              title="Retry Transcript"
              onPress={handleRetryTranscript}
              loading={retryingTranscript}
              variant="secondary"
            />
          )}

          {/* Expanded transcript viewer */}
          {loadingTranscript && (
            <View style={styles.searchLoading}>
              <LoadingSpinner />
            </View>
          )}
          {transcriptExpanded && transcriptSegments.length > 0 && (
            <ScrollView
              nestedScrollEnabled
              style={[styles.transcriptViewer, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              {transcriptSegments.map((seg, idx) => {
                const isActive = activeSegment?.segment_id === seg.segment_id;
                return (
                  <TouchableOpacity
                    key={seg.segment_id}
                    onPress={() => handleTranscriptSegmentTap(seg)}
                    activeOpacity={0.7}
                    style={[
                      styles.transcriptRow,
                      idx < transcriptSegments.length - 1 && { borderBottomColor: colors.border },
                      isActive && { backgroundColor: colors.amberDim },
                    ]}
                  >
                    <Text style={[styles.transcriptTimestamp, { color: isActive ? colors.amber : colors.textMid }]}>
                      {formatTimestamp(seg.start_seconds)}
                    </Text>
                    <Text style={[styles.transcriptText, { color: isActive ? colors.text : colors.textMid }]}>
                      {seg.text}
                    </Text>
                    {isActive && (
                      <Ionicons name="volume-high" size={12} color={colors.amber} style={{ flexShrink: 0, marginLeft: 4 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

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
            <Text style={[styles.noResults, { color: colors.textMid }]}>No matching frames or audio found</Text>
          )}

          {searchResults.length > 0 && (
            <View style={styles.resultsGrid}>
              {searchResults.map((result) => {
                const isSelected = selectedFrameId === result.frame_id;
                const isTranscript = result.source_type === 'transcript';
                return (
                  <TouchableOpacity
                    key={isTranscript ? (result.segment_id || result.frame_id) : result.frame_id}
                    activeOpacity={0.8}
                    onPress={() => handleFrameTap(result)}
                    style={[
                      styles.resultCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isSelected ? colors.amber : result.match_type === 'exact' ? colors.success : isTranscript ? colors.amber + '60' : colors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    {(() => {
                      if (isSelected) {
                        return (
                          <View style={[styles.audioBadge, { backgroundColor: colors.amber }]}>
                            <Ionicons name="play" size={8} color="#fff" />
                            <Text style={styles.playingText}>Playing</Text>
                          </View>
                        );
                      }
                      if (result.match_type === 'exact') {
                        return (
                          <View style={[styles.audioBadge, { backgroundColor: colors.success }]}>
                            <Ionicons name="checkmark-circle" size={8} color="#fff" />
                            <Text style={styles.playingText}>Exact</Text>
                          </View>
                        );
                      }
                      if (result.match_type === 'semantic_audio') {
                        return (
                          <View style={[styles.audioBadge, { backgroundColor: colors.amber }]}>
                            <Ionicons name="mic" size={8} color="#fff" />
                            <Text style={styles.playingText}>Audio</Text>
                          </View>
                        );
                      }
                      return (
                        <View style={[styles.audioBadge, { backgroundColor: '#5B8DEF' }]}>
                          <Ionicons name="eye" size={8} color="#fff" />
                          <Text style={styles.playingText}>Visual</Text>
                        </View>
                      );
                    })()}
                    <TouchableOpacity
                      style={styles.moreBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => handleGenerateClip(result)}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
                    </TouchableOpacity>
                    <Image
                      source={{ uri: resolveMediaUrl(result.frame_url) ?? '' }}
                      style={styles.resultImage}
                      resizeMode="cover"
                    />
                    {isTranscript && result.transcript_text ? (
                      <View style={[styles.transcriptSnippet, { backgroundColor: colors.amberDim }]}>
                        <Text style={[styles.transcriptSnippetText, { color: colors.text }]} numberOfLines={2}>
                          "{result.transcript_text}"
                        </Text>
                      </View>
                    ) : null}
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
                    <Image source={{ uri: resolveMediaUrl(clip.thumbnail_url)! }} style={styles.clipThumbImage} resizeMode="cover" />
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
  playingText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: 9,
  },
  audioBadge: {
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
  resultImage: {
    width: '100%',
    height: 90,
    backgroundColor: '#1A1A1E',
  },
  transcriptSnippet: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
  },
  transcriptSnippetText: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
    fontStyle: 'italic',
  },
  resultInfo: {
    padding: Spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultTime: { fontFamily: FontFamily.mono, fontSize: FontSize.xs },
  resultScore: { fontFamily: FontFamily.regular, fontSize: 10 },
  transcriptSection: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: Spacing.sm },
  transcriptHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  transcriptTitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  transcriptInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  transcriptViewer: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 360,
  },
  transcriptRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  transcriptTimestamp: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    width: 42,
    flexShrink: 0,
  },
  transcriptText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    flex: 1,
    lineHeight: 20,
  },
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
