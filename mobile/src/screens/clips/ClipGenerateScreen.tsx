import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, LayoutChangeEvent } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { clipsApi } from '../../services/api';
import Button from '../../components/common/Button';
import RangeSlider from '../../components/common/RangeSlider';
import type { ClipGenerateScreenProps } from '../../types/navigation.types';

export default function ClipGenerateScreen({ route, navigation }: ClipGenerateScreenProps) {
  const { videoId, timestamp, frameId, videoTitle, videoDuration, videoUri } = route.params;
  const { colors } = useTheme();
  const videoRef = useRef<Video>(null);

  const defaultStart = Math.max(0, timestamp - 5);
  const defaultEnd = Math.min(videoDuration, timestamp + 5);

  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [title, setTitle] = useState(`Clip from ${videoTitle}`);
  const [generating, setGenerating] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(300);

  const handleValuesChange = (start: number, end: number) => {
    const startChanged = Math.abs(start - startTime) > 0.05;
    const endChanged = Math.abs(end - endTime) > 0.05;
    setStartTime(start);
    setEndTime(end);
    // Seek to whichever thumb the user is dragging
    if (endChanged && !startChanged) {
      videoRef.current?.setPositionAsync(end * 1000);
    } else {
      videoRef.current?.setPositionAsync(start * 1000);
    }
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title for the clip');
      return;
    }
    setGenerating(true);
    try {
      const res = await clipsApi.create({
        video_id: videoId,
        title: title.trim(),
        start_time: Math.round(startTime * 10) / 10,
        end_time: Math.round(endTime * 10) / 10,
        source_timestamp: timestamp,
        source_frame_id: frameId,
      });
      const clipId = res.data.data.clip_id;
      navigation.replace('ClipDetail', { clipId });
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to generate clip');
    } finally {
      setGenerating(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const duration = Math.round((endTime - startTime) * 10) / 10;

  const onSliderLayout = (e: LayoutChangeEvent) => {
    setSliderWidth(e.nativeEvent.layout.width - Spacing.xl * 2);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={styles.videoPlayer}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        positionMillis={timestamp * 1000}
      />

      <View style={styles.section} onLayout={onSliderLayout}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Range</Text>
        <RangeSlider
          min={0}
          max={videoDuration}
          startValue={startTime}
          endValue={endTime}
          onValuesChange={handleValuesChange}
          formatLabel={formatTime}
          trackWidth={sliderWidth}
        />
        <View style={styles.timeRow}>
          <Text style={[styles.timeLabel, { color: colors.textMid }]}>
            Duration: {formatTime(duration)} ({duration}s)
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          placeholderTextColor={colors.textDim}
          placeholder="Enter clip title..."
          maxLength={500}
        />
      </View>

      <View style={styles.section}>
        <Button
          title={generating ? 'Generating...' : 'Generate Clip'}
          onPress={handleGenerate}
          loading={generating}
          disabled={generating || duration < 0.5}
          size="lg"
        />
        {duration > 120 && (
          <Text style={[styles.warning, { color: colors.error }]}>
            Clip duration cannot exceed 2 minutes
          </Text>
        )}
      </View>
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
  section: { padding: Spacing.xl, gap: Spacing.sm },
  sectionTitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.lg },
  timeRow: { flexDirection: 'row', justifyContent: 'center' },
  timeLabel: { fontFamily: FontFamily.mono, fontSize: FontSize.sm },
  input: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  warning: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, textAlign: 'center' },
});
