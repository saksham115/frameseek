import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { clipsApi } from '../../services/api';
import { resolveMediaUrl } from '../../utils/url';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { formatDuration, formatFileSize, formatTimeAgo } from '../../utils/formatting';
import type { ClipDetailScreenProps } from '../../types/navigation.types';
import type { ClipData } from '../../types/api.types';

export default function ClipDetailScreen({ route, navigation }: ClipDetailScreenProps) {
  const { clipId } = route.params;
  const { colors } = useTheme();
  const [clip, setClip] = useState<ClipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await clipsApi.get(clipId);
      setClip(res.data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, [clipId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const clipUri = resolveMediaUrl(clip?.clip_url);

  const handleShare = async () => {
    if (!clipUri) return;
    setSharing(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }
      const localPath = `${FileSystem.cacheDirectory}clip_${clipId}.mp4`;
      const { status } = await FileSystem.downloadAsync(clipUri, localPath);
      if (status !== 200) {
        Alert.alert('Error', `Download failed (status ${status})`);
        return;
      }
      await Sharing.shareAsync(localPath, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to share clip');
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Clip', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await clipsApi.delete(clipId);
            navigation.goBack();
          } catch {}
        },
      },
    ]);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return <LoadingSpinner />;
  if (!clip) return <EmptyState icon="alert-circle" title="Not found" message="Clip not found" />;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {clipUri ? (
        <Video
          source={{ uri: clipUri }}
          style={styles.videoPlayer}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
        />
      ) : (
        <View style={[styles.playerPlaceholder, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.placeholderText, { color: colors.textMid }]}>Clip not available</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]}>{clip.title}</Text>

        <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MetaRow label="Duration" value={formatTime(clip.duration_seconds)} colors={colors} />
          {clip.file_size_bytes != null && (
            <MetaRow label="Size" value={formatFileSize(clip.file_size_bytes)} colors={colors} />
          )}
          <MetaRow label="Range" value={`${formatTime(clip.start_time)} – ${formatTime(clip.end_time)}`} colors={colors} />
          <MetaRow label="Created" value={formatTimeAgo(clip.created_at)} colors={colors} />
          {clip.video_title && (
            <MetaRow
              label="Source"
              value={clip.video_title}
              colors={colors}
              numberOfLines={1}
              onPress={() => navigation.navigate('VideoDetail', { videoId: clip.video_id })}
            />
          )}
        </View>

        <View style={styles.buttons}>
          {clipUri && (
            <Button title="Share Clip" onPress={handleShare} loading={sharing} />
          )}
          <Button title="Delete Clip" onPress={handleDelete} variant="secondary" />
        </View>
      </View>
    </ScrollView>
  );
}

function MetaRow({ label, value, colors, numberOfLines, onPress }: { label: string; value: string; colors: any; numberOfLines?: number; onPress?: () => void }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={metaStyles.row} onPress={onPress} activeOpacity={0.6}>
      <Text style={[metaStyles.label, { color: colors.textMid }]}>{label}</Text>
      <Text style={[metaStyles.value, { color: onPress ? colors.amber : colors.text }]} numberOfLines={numberOfLines} ellipsizeMode="tail">{value}</Text>
    </Wrapper>
  );
}

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 12 },
  label: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, flexShrink: 0 },
  value: { fontFamily: FontFamily.medium, fontSize: FontSize.sm, flexShrink: 1, textAlign: 'right' },
});

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
  placeholderText: { fontFamily: FontFamily.regular, fontSize: FontSize.sm },
  info: { padding: Spacing.xl, gap: Spacing.lg },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xl },
  metaCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  buttons: { gap: Spacing.sm },
});
