import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../../types/navigation.types';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { videosApi } from '../../services/api';
import { useVideosStore } from '../../store/slices/videosSlice';
import Button from '../../components/common/Button';
import ProgressBar from '../../components/common/ProgressBar';
import { formatFileSize } from '../../utils/formatting';

export default function UploadScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoProcess, setAutoProcess] = useState(true);

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please grant access to your media library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.fileName || 'video.mp4',
        size: asset.fileSize || 0,
      });
    }
  };

  const pickFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        size: asset.size || 0,
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(0);

    try {
      // Generate thumbnail from video
      let thumbnailUri: string | null = null;
      try {
        const thumb = await VideoThumbnails.getThumbnailAsync(selectedFile.uri, { time: 1000 });
        thumbnailUri = thumb.uri;
      } catch {}

      const formData = new FormData();
      formData.append('file', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: 'video/mp4',
      } as any);
      formData.append('title', selectedFile.name.replace(/\.[^.]+$/, ''));
      formData.append('local_uri', selectedFile.uri);
      if (thumbnailUri) formData.append('thumbnail_uri', thumbnailUri);
      formData.append('auto_process', String(autoProcess));

      await videosApi.upload(formData);
      setProgress(100);

      // Navigate to Videos tab with All filter
      useVideosStore.getState().setActiveFilter('all');
      navigation.replace('MainTabs', { screen: 'Videos' } as any);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Something went wrong');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {!selectedFile ? (
          <>
            <Text style={[styles.heading, { color: colors.text }]}>Choose a video</Text>
            <Text style={[styles.subtitle, { color: colors.textMid }]}>Select a video to upload and process</Text>

            <View style={styles.options}>
              <Button title="Camera Roll" onPress={pickFromLibrary} variant="secondary" style={styles.optionBtn} />
              <Button title="Browse Files" onPress={pickFromFiles} variant="secondary" style={styles.optionBtn} />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.fileName, { color: colors.text }]}>{selectedFile.name}</Text>
              <Text style={[styles.fileSize, { color: colors.textMid }]}>{formatFileSize(selectedFile.size)}</Text>
            </View>

            {uploading && (
              <View style={styles.progressSection}>
                <ProgressBar progress={progress} />
                <Text style={[styles.progressText, { color: colors.textMid }]}>
                  {progress < 100 ? 'Uploading...' : 'Complete!'}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <Button title={uploading ? 'Uploading...' : 'Upload'} onPress={handleUpload} loading={uploading} disabled={uploading} />
              <Button
                title="Change File"
                onPress={() => setSelectedFile(null)}
                variant="ghost"
                disabled={uploading}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, flex: 1, justifyContent: 'center' },
  heading: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl, textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.regular, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xxl },
  options: { gap: Spacing.md },
  optionBtn: { height: 56 },
  preview: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  fileName: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md },
  fileSize: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, marginTop: Spacing.xs },
  progressSection: { marginBottom: Spacing.xl, gap: Spacing.sm },
  progressText: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, textAlign: 'center' },
  actions: { gap: Spacing.md },
});
