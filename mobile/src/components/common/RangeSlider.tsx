import React, { useRef } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize } from '../../constants/theme';

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;
const MIN_GAP = 1; // minimum 1 second gap

interface RangeSliderProps {
  min: number;
  max: number;
  startValue: number;
  endValue: number;
  onValuesChange: (start: number, end: number) => void;
  formatLabel?: (value: number) => string;
  trackWidth?: number;
}

function defaultFormat(value: number): string {
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function RangeSlider({
  min,
  max,
  startValue,
  endValue,
  onValuesChange,
  formatLabel = defaultFormat,
  trackWidth = 300,
}: RangeSliderProps) {
  const { colors } = useTheme();
  const trackRef = useRef<View>(null);
  const trackOriginX = useRef(0);

  const range = max - min || 1;
  const valueToX = (v: number) => ((v - min) / range) * trackWidth;
  const xToValue = (x: number) => Math.round((min + (x / trackWidth) * range) * 10) / 10;

  const clampStart = (x: number) => {
    const maxX = valueToX(endValue) - (MIN_GAP / range) * trackWidth;
    return Math.max(0, Math.min(x, maxX));
  };

  const clampEnd = (x: number) => {
    const minX = valueToX(startValue) + (MIN_GAP / range) * trackWidth;
    return Math.min(trackWidth, Math.max(x, minX));
  };

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x) => {
      trackOriginX.current = x;
    });
  };

  const startResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: measureTrack,
    onPanResponderMove: (_, gesture) => {
      const x = clampStart(gesture.moveX - trackOriginX.current);
      const val = Math.max(min, xToValue(x));
      onValuesChange(val, endValue);
    },
  });

  const endResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: measureTrack,
    onPanResponderMove: (_, gesture) => {
      const x = clampEnd(gesture.moveX - trackOriginX.current);
      const val = Math.min(max, xToValue(x));
      onValuesChange(startValue, val);
    },
  });

  const startX = valueToX(startValue);
  const endX = valueToX(endValue);

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.amber }]}>{formatLabel(startValue)}</Text>
        <Text style={[styles.label, { color: colors.amber }]}>{formatLabel(endValue)}</Text>
      </View>
      <View ref={trackRef} style={[styles.track, { width: trackWidth, backgroundColor: colors.surfaceRaised }]}>
        <View style={[styles.activeTrack, { backgroundColor: colors.amber, left: startX, width: endX - startX }]} />
        <View
          {...startResponder.panHandlers}
          style={[styles.thumb, { backgroundColor: colors.amber, left: startX - THUMB_SIZE / 2 }]}
        />
        <View
          {...endResponder.panHandlers}
          style={[styles.thumb, { backgroundColor: colors.amber, left: endX - THUMB_SIZE / 2 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 16 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontFamily: FontFamily.mono, fontSize: FontSize.sm },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
  },
  activeTrack: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: -(THUMB_SIZE - TRACK_HEIGHT) / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});
