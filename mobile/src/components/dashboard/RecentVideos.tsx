import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import Badge from '../common/Badge';
import { formatTimeAgo } from '../../utils/formatting';
import type { VideoData } from '../../types/api.types';

interface RecentVideosProps {
  videos: VideoData[];
  onVideoPress: (videoId: string) => void;
}

export default function RecentVideos({ videos, onVideoPress }: RecentVideosProps) {
  const { colors } = useTheme();

  if (videos.length === 0) return null;

  return (
    <View style={styles.container}>
      {videos.map((video) => (
        <TouchableOpacity
          key={video.video_id}
          onPress={() => onVideoPress(video.video_id)}
          style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.icon, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="videocam" size={18} color={colors.textMid} />
          </View>
          <View style={styles.info}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{video.title}</Text>
            <Text style={[styles.time, { color: colors.textMid }]}>{formatTimeAgo(video.created_at)}</Text>
          </View>
          <Badge
            label={video.status}
            variant={video.status === 'ready' ? 'success' : video.status === 'error' ? 'error' : 'default'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  title: { fontFamily: FontFamily.medium, fontSize: FontSize.sm },
  time: { fontFamily: FontFamily.regular, fontSize: FontSize.xs },
});
