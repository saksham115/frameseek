import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import Badge from '../common/Badge';
import { formatDuration, formatFileSize, formatTimeAgo } from '../../utils/formatting';
import type { VideoData } from '../../types/api.types';

interface VideoCardProps {
  video: VideoData;
  onPress: () => void;
  onDelete?: () => void;
}

export default function VideoCard({ video, onPress, onDelete }: VideoCardProps) {
  const { colors } = useTheme();

  const statusVariant =
    video.status === 'ready' ? 'success' :
    video.status === 'error' ? 'error' :
    video.status === 'processing' || video.status === 'queued' ? 'amber' :
    'default';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.thumbnail, { backgroundColor: colors.surfaceRaised }]}>
        {video.thumbnail_uri ? (
          <Image source={{ uri: video.thumbnail_uri }} style={styles.thumbnailImage} />
        ) : (
          <Ionicons name="videocam" size={24} color={colors.textDim} />
        )}
        {video.duration_seconds && (
          <View style={[styles.duration, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
            <Text style={styles.durationText}>{formatDuration(video.duration_seconds)}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{video.title}</Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textMid }]}>{formatFileSize(video.file_size_bytes)}</Text>
          <Text style={[styles.metaText, { color: colors.textMid }]}>{formatTimeAgo(video.created_at)}</Text>
        </View>
        <View style={styles.statusRow}>
          <Badge label={video.status} variant={statusVariant} />
        </View>
      </View>
      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  thumbnail: {
    width: 100,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  duration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  durationText: {
    color: '#fff',
    fontFamily: FontFamily.mono,
    fontSize: 10,
  },
  info: {
    flex: 1,
    padding: Spacing.sm,
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metaText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deleteButton: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
