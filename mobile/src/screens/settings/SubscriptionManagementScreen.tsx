import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useSubscriptionStore } from '../../store/slices/subscriptionSlice';
import type { AppStackParamList } from '../../types/navigation.types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SubscriptionManagementScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { subscriptionStatus, currentPlan, restorePurchases } = useSubscriptionStore();

  const sub = subscriptionStatus?.subscription;
  const storageUsed = subscriptionStatus?.storage_used_bytes ?? 0;
  const storageLimit = subscriptionStatus?.storage_limit_bytes ?? 0;
  const storagePercent = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;

  const handleManageSubscription = () => {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  };

  const handleRestore = async () => {
    await restorePurchases();
    Alert.alert('Restore Complete', 'Your purchases have been restored.');
  };

  const InfoRow = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
    <View style={[styles.infoRow, { borderColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.textMid }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
    >
      {/* Plan badge */}
      <View style={[styles.planBadgeContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.planIcon, { backgroundColor: colors.amberDim }]}>
          <Ionicons
            name={currentPlan === 'free' ? 'person' : 'diamond'}
            size={24}
            color={colors.amber}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: colors.text }]}>
            {(subscriptionStatus?.plan_name || currentPlan).charAt(0).toUpperCase() +
              (subscriptionStatus?.plan_name || currentPlan).slice(1)}{' '}
            Plan
          </Text>
          {sub?.status && (
            <Text
              style={[
                styles.statusText,
                {
                  color:
                    sub.status === 'active'
                      ? colors.success
                      : sub.status === 'billing_retry'
                        ? colors.amber
                        : colors.error,
                },
              ]}
            >
              {sub.status === 'active'
                ? 'Active'
                : sub.status === 'billing_retry'
                  ? 'Billing Issue'
                  : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
            </Text>
          )}
        </View>
      </View>

      {/* Storage usage */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>Storage</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.storageHeader}>
          <Text style={[styles.storageUsed, { color: colors.text }]}>
            {formatBytes(storageUsed)} of {formatBytes(storageLimit)}
          </Text>
          <Text style={[styles.storagePercent, { color: storagePercent > 80 ? colors.error : colors.textMid }]}>
            {storagePercent.toFixed(0)}%
          </Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.surfaceRaised }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: storagePercent > 80 ? colors.error : colors.amber,
                width: `${Math.min(storagePercent, 100)}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Plan details */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>Plan Details</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <InfoRow
          label="Search limit"
          value={`${subscriptionStatus?.monthly_search_limit ?? 20}/month`}
        />
        <InfoRow label="Retention" value={`${subscriptionStatus?.retention_days ?? 15} days`} />
        {sub && (
          <>
            <InfoRow label="Billing" value={sub.billing_period === 'annual' ? 'Annual' : 'Monthly'} />
            <InfoRow label="Renews" value={formatDate(sub.expires_at)} />
            <InfoRow
              label="Auto-renew"
              value={sub.auto_renew_enabled ? 'On' : 'Off'}
              valueColor={sub.auto_renew_enabled ? colors.success : colors.error}
            />
            {sub.cancelled_at && <InfoRow label="Cancelled" value={formatDate(sub.cancelled_at)} valueColor={colors.error} />}
          </>
        )}
      </View>

      {/* Actions */}
      {currentPlan !== 'free' && (
        <TouchableOpacity
          onPress={handleManageSubscription}
          style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="settings-outline" size={20} color={colors.amber} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Manage in App Store</Text>
          <Ionicons name="open-outline" size={16} color={colors.textDim} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => navigation.navigate('Paywall', { source: 'management' })}
        style={[styles.actionBtn, { backgroundColor: colors.amber, borderColor: colors.amber }]}
      >
        <Ionicons name="arrow-up-circle" size={20} color="#fff" />
        <Text style={[styles.actionBtnText, { color: '#fff', flex: 1 }]}>
          {currentPlan === 'free' ? 'Upgrade Plan' : 'Change Plan'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleRestore} style={styles.restoreBtn}>
        <Text style={[styles.restoreText, { color: colors.textMid }]}>Restore Purchases</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl },
  planBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: { fontFamily: FontFamily.bold, fontSize: FontSize.xl },
  statusText: { fontFamily: FontFamily.medium, fontSize: FontSize.sm, marginTop: 2 },
  sectionLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
    textTransform: 'uppercase',
  },
  section: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg },
  storageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  storageUsed: { fontFamily: FontFamily.medium, fontSize: FontSize.md },
  storagePercent: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontFamily: FontFamily.regular, fontSize: FontSize.md },
  infoValue: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
  },
  actionBtnText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md, flex: 1 },
  restoreBtn: { alignItems: 'center', marginTop: Spacing.lg, padding: Spacing.md },
  restoreText: { fontFamily: FontFamily.medium, fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
