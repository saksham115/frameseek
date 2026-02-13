import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import ProgressBar from '../common/ProgressBar';

interface UploadProgressProps {
  progress: number;
  status: string;
}

export default function UploadProgress({ progress, status }: UploadProgressProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ProgressBar progress={progress} />
      <Text style={[styles.status, { color: colors.textMid }]}>{status}</Text>
      <Text style={[styles.percent, { color: colors.amber }]}>{progress}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  status: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, textAlign: 'center' },
  percent: { fontFamily: FontFamily.semiBold, fontSize: FontSize.lg, textAlign: 'center' },
});
