import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { BorderRadius, FontFamily, FontSize, Spacing } from '../../constants/theme';
import { STORAGE_BASE_URL } from '../../constants/config';
import { useAuthStore } from '../../store/slices/authSlice';
import { apiClient } from '../../services/api';
import SearchBar from '../../components/search/SearchBar';
import FAB from '../../components/common/FAB';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';
import type { AppStackParamList } from '../../types/navigation.types';
import type { VideoData } from '../../types/api.types';
import { formatDuration, formatTimeAgo } from '../../utils/formatting';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const [recentVideos, setRecentVideos] = useState<VideoData[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const videosRes = await apiClient.get('/videos', { params: { limit: 10 } });
      setRecentVideos(videosRes.data.data.videos);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />}
      >
        <View style={styles.titleRow}>
          <FrameSeekIcon size={28} />
          <Text style={[styles.greeting, { color: colors.text }]}>
            Hello{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </Text>
        </View>

        <SearchBar
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            if (text.length > 0) navigation.navigate('MainTabs', { screen: 'Search' });
          }}
          placeholder="Search your videos..."
        />

        {recentVideos.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Videos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {recentVideos.map((item) => (
                <TouchableOpacity
                  key={item.video_id}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('VideoDetail', { videoId: item.video_id })}
                  style={[styles.carouselCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.carouselThumb, { backgroundColor: colors.surfaceRaised }]}>
                    {(item.thumbnail_url || item.thumbnail_uri) ? (
                      <Image source={{ uri: item.thumbnail_url ? `${STORAGE_BASE_URL}${item.thumbnail_url.replace('/storage', '')}` : item.thumbnail_uri! }} style={styles.carouselThumbImage} />
                    ) : (
                      <Ionicons name="videocam" size={28} color={colors.textDim} />
                    )}
                    {item.duration_seconds != null && (
                      <View style={styles.carouselDuration}>
                        <Text style={styles.carouselDurationText}>{formatDuration(item.duration_seconds)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.carouselInfo}>
                    <Text style={[styles.carouselTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.carouselMeta, { color: colors.textMid }]}>{formatTimeAgo(item.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <FAB icon="cloud-upload" onPress={() => navigation.navigate('Upload')} />
    </View>
  );
}

const CARD_WIDTH = 160;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingTop: Spacing.xxxl + 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  greeting: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl },
  section: { marginTop: Spacing.xl },
  sectionTitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.lg, marginBottom: Spacing.md },
  carousel: { gap: Spacing.md },
  carouselCard: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  carouselThumb: {
    width: CARD_WIDTH,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselThumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  carouselDuration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  carouselDurationText: {
    color: '#fff',
    fontFamily: FontFamily.mono,
    fontSize: 10,
  },
  carouselInfo: {
    padding: Spacing.sm,
    gap: 2,
  },
  carouselTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xs,
  },
  carouselMeta: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
  },
});
