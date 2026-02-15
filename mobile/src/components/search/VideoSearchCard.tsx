import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import { STORAGE_BASE_URL } from '../../constants/config';
import TranscriptResultBadge from './TranscriptResultBadge';
import type { SearchResultData } from '../../types/api.types';

interface VideoSearchCardProps {
  videoTitle: string;
  results: SearchResultData[];
  onPress: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_PADDING = Spacing.xl;
const CARD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;
const THUMB_SIZE = 64;
const MAX_THUMBS = 4;
const MAX_TRANSCRIPT_BADGES = 2;

function getImageUrl(frameUrl: string) {
  return `${STORAGE_BASE_URL}/frames/${(frameUrl || '').replace('/storage/frames/', '')}`;
}

export default function VideoSearchCard({ videoTitle, results, onPress }: VideoSearchCardProps) {
  const { colors } = useTheme();

  const { frameResults, transcriptResults } = useMemo(() => {
    const frame: SearchResultData[] = [];
    const transcript: SearchResultData[] = [];
    for (const r of results) {
      if (r.source_type === 'transcript') {
        transcript.push(r);
      } else {
        frame.push(r);
      }
    }
    return { frameResults: frame, transcriptResults: transcript };
  }, [results]);

  const displayResults = frameResults.slice(0, MAX_THUMBS);
  const remaining = frameResults.length - MAX_THUMBS;
  const topScore = Math.round(results[0].score * 100);

  const audioCount = transcriptResults.length;
  const matchText = `${results.length} ${results.length === 1 ? 'match' : 'matches'}${audioCount > 0 ? ` · ${audioCount} audio` : ''}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {videoTitle}
          </Text>
          <Text style={[styles.meta, { color: colors.textMid }]}>
            {matchText} · up to {topScore}%
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
      </View>

      {/* Cascading frame thumbnails */}
      {displayResults.length > 0 && (
        <View style={styles.thumbRow}>
          {displayResults.map((result, index) => (
            <View
              key={result.frame_id}
              style={[
                styles.thumbWrapper,
                {
                  zIndex: MAX_THUMBS - index,
                  marginLeft: index === 0 ? 0 : -12,
                },
              ]}
            >
              <Image
                source={{ uri: getImageUrl(result.frame_url) }}
                style={[styles.thumb, { borderColor: colors.surface }]}
                resizeMode="cover"
              />
              <View style={[styles.thumbTimestamp, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
                <Text style={styles.thumbTimestampText}>{result.formatted_timestamp}</Text>
              </View>
            </View>
          ))}
          {remaining > 0 && (
            <View style={[styles.thumbWrapper, { zIndex: 0, marginLeft: -12 }]}>
              <View style={[styles.thumb, styles.moreThumb, { borderColor: colors.surface, backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.moreText, { color: colors.amber }]}>+{remaining}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Transcript result badges */}
      {transcriptResults.length > 0 && (
        <View style={styles.transcriptSection}>
          {transcriptResults.slice(0, MAX_TRANSCRIPT_BADGES).map((result) => (
            <TranscriptResultBadge
              key={result.segment_id || result.frame_id}
              text={result.transcript_text || ''}
              timestamp={result.formatted_timestamp}
              score={result.score}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
  },
  meta: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.xs,
  },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    backgroundColor: '#1A1A1E',
  },
  thumbTimestamp: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    alignItems: 'center',
  },
  thumbTimestampText: {
    color: '#fff',
    fontFamily: FontFamily.mono,
    fontSize: 8,
  },
  moreThumb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
  },
  transcriptSection: {
    gap: Spacing.xs,
  },
});
