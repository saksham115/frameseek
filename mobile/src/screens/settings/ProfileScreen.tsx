import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useAuthStore } from '../../store/slices/authSlice';
import { apiClient } from '../../services/api';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';
import { formatFileSize } from '../../utils/formatting';

interface SearchQuota {
  used: number;
  limit: number;
  remaining: number;
  resets_at: string | null;
}

interface StorageQuota {
  used_bytes: number;
  limit_bytes: number;
  used_percentage: number;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [searchQuota, setSearchQuota] = useState<SearchQuota | null>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);

  const planDisplay = user?.plan_type === 'pro' ? 'Pro' : user?.plan_type === 'enterprise' ? 'Enterprise' : 'Free';

  useFocusEffect(useCallback(() => {
    const fetchData = async () => {
      try {
        const [searchRes, storageRes] = await Promise.all([
          apiClient.get('/search/quota'),
          apiClient.get('/storage/quota'),
        ]);
        setSearchQuota(searchRes.data.data);
        setStorageQuota(storageRes.data.data);
      } catch {}
    };
    fetchData();
  }, []));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.iconHeader}>
          <FrameSeekIcon size={28} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        </View>

        {/* Avatar placeholder */}
        <View style={[styles.avatar, { backgroundColor: colors.amberDim }]}>
          <Text style={[styles.avatarText, { color: colors.amber }]}>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </Text>
        </View>

        <Input label="Name" value={name} onChangeText={setName} />
        <Input label="Email" value={email} editable={false} />

        {/* Plan info */}
        <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: colors.text }]}>Current Plan</Text>
            <Badge label={planDisplay} variant="amber" />
          </View>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: colors.textMid }]}>Storage Used</Text>
            <Text style={[styles.planValue, { color: colors.text }]}>
              {formatFileSize(storageQuota?.used_bytes ?? user?.storage_used_bytes ?? 0)} / {formatFileSize(storageQuota?.limit_bytes ?? user?.storage_limit_bytes ?? 5368709120)}
            </Text>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: colors.textMid }]}>Daily Searches</Text>
            <Text style={[styles.planValue, { color: colors.text }]}>
              {searchQuota ? `${searchQuota.used} / ${searchQuota.limit}` : '-- / --'}
            </Text>
          </View>
          {searchQuota && (
            <Text style={[styles.quotaHint, { color: colors.textDim }]}>
              {searchQuota.remaining} searches remaining today
            </Text>
          )}
        </View>

        <Button title="Save Changes" onPress={() => Alert.alert('Saved', 'Profile updated')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingTop: Spacing.xxxl + 20 },
  iconHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  headerTitle: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  avatarText: { fontFamily: FontFamily.bold, fontSize: FontSize.xxxl },
  planCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { fontFamily: FontFamily.medium, fontSize: FontSize.sm },
  planValue: { fontFamily: FontFamily.regular, fontSize: FontSize.sm },
  separator: { height: StyleSheet.hairlineWidth },
  quotaHint: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, textAlign: 'right' },
});
