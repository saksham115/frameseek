import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useAuthStore } from '../../store/slices/authSlice';
import { useUIStore } from '../../store/slices/uiSlice';
import LegalContent from '../../components/legal/LegalContent';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';
import { useSubscriptionStore } from '../../store/slices/subscriptionSlice';
import type { AppStackParamList } from '../../types/navigation.types';

export default function SettingsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const { themePreference, setThemePreference } = useUIStore();
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const [legalType, setLegalType] = useState<'tos' | 'privacy' | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteReasons = [
    { key: 'no_longer_needed', label: "I no longer need the app" },
    { key: 'too_expensive', label: 'Too expensive' },
    { key: 'privacy_concerns', label: 'Privacy concerns' },
    { key: 'found_alternative', label: 'Found a better alternative' },
    { key: 'difficult_to_use', label: 'Difficult to use' },
    { key: 'other', label: 'Other' },
  ];

  const handleDeleteAccount = async () => {
    if (!deleteReason) return;
    setIsDeleting(true);
    try {
      await deleteAccount(deleteReason, deleteFeedback || undefined);
    } catch {
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteReason(null);
      setDeleteFeedback('');
    }
  };

  const SettingsRow = ({ icon, label, onPress, right }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress?: () => void;
    right?: React.ReactNode;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress && !right}
      style={[styles.row, { borderColor: colors.border }]}
    >
      <Ionicons name={icon} size={20} color={colors.textMid} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {right || (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />)}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <FrameSeekIcon size={24} />
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      {/* Account */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>Account</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow icon="person" label={user?.name || 'Profile'} onPress={() => navigation.navigate('Profile')} />
        <SettingsRow icon="mail" label={user?.email || 'Email'} />
        <SettingsRow
          icon="diamond"
          label={`${currentPlan === 'pro_max' ? 'Pro Max' : (currentPlan || 'free').charAt(0).toUpperCase() + (currentPlan || 'free').slice(1)} Plan`}
          onPress={() =>
            navigation.navigate(currentPlan === 'free' ? 'Paywall' : 'SubscriptionManagement')
          }
          right={
            currentPlan !== 'free' ? (
              <View style={[styles.planBadge, { backgroundColor: colors.amberDim }]}>
                <Text style={{ color: colors.amber, fontFamily: FontFamily.semiBold, fontSize: FontSize.xs }}>
                  {currentPlan === 'pro_max' ? 'PRO MAX' : currentPlan.toUpperCase()}
                </Text>
              </View>
            ) : undefined
          }
        />
      </View>

      {/* Appearance */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>Appearance</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow
          icon="moon"
          label="Dark Mode"
          right={
            <Switch
              value={themePreference === 'dark' || (themePreference === 'system' && isDark)}
              onValueChange={(val) => setThemePreference(val ? 'dark' : 'light')}
              trackColor={{ false: colors.surfaceRaised, true: colors.amber }}
              thumbColor="#fff"
            />
          }
        />
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>About</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow icon="information-circle" label="Version 1.0.0" />
        <SettingsRow icon="document-text" label="Terms of Service" onPress={() => setLegalType('tos')} />
        <SettingsRow icon="lock-closed" label="Privacy Policy" onPress={() => setLegalType('privacy')} />
      </View>

      {/* Logout */}
      <TouchableOpacity onPress={logout} style={[styles.logoutBtn, { borderColor: colors.error + '44' }]}>
        <Ionicons name="log-out" size={20} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Sign Out</Text>
      </TouchableOpacity>

      {/* Delete Account */}
      <TouchableOpacity
        onPress={() => setShowDeleteModal(true)}
        style={[styles.deleteBtn, { borderColor: colors.error + '22' }]}
      >
        <Ionicons name="trash" size={20} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Delete Account</Text>
      </TouchableOpacity>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingTop: insets.top || Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Account</Text>
            <TouchableOpacity onPress={() => { setShowDeleteModal(false); setDeleteReason(null); setDeleteFeedback(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textMid} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={[styles.deleteWarningBox, { backgroundColor: colors.error + '11', borderColor: colors.error + '33' }]}>
              <Ionicons name="warning" size={20} color={colors.error} />
              <Text style={[styles.deleteWarningText, { color: colors.error }]}>
                This will permanently delete your account and all associated data, including videos, clips, frames, and search history. This action cannot be undone.
              </Text>
            </View>

            <Text style={[styles.deleteSubheading, { color: colors.text }]}>
              We're sorry to see you go. Please let us know why you're leaving so we can improve.
            </Text>

            {deleteReasons.map((r) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => setDeleteReason(r.key)}
                style={[
                  styles.reasonRow,
                  {
                    borderColor: deleteReason === r.key ? colors.error : colors.border,
                    backgroundColor: deleteReason === r.key ? colors.error + '0A' : colors.surface,
                  },
                ]}
              >
                <View style={[styles.radioOuter, { borderColor: deleteReason === r.key ? colors.error : colors.textDim }]}>
                  {deleteReason === r.key && <View style={[styles.radioInner, { backgroundColor: colors.error }]} />}
                </View>
                <Text style={[styles.reasonText, { color: colors.text }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.feedbackLabel, { color: colors.textMid }]}>Additional feedback (optional)</Text>
            <TextInput
              style={[styles.feedbackInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Tell us more about your experience..."
              placeholderTextColor={colors.textDim}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={deleteFeedback}
              onChangeText={setDeleteFeedback}
            />

            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Are you sure?',
                  'This is your final confirmation. Your account and all data will be permanently deleted.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete Forever', style: 'destructive', onPress: handleDeleteAccount },
                  ],
                )
              }
              disabled={!deleteReason || isDeleting}
              style={[
                styles.confirmDeleteBtn,
                {
                  backgroundColor: deleteReason ? colors.error : colors.error + '44',
                },
              ]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.confirmDeleteText}>Permanently Delete Account</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Legal content modal */}
      <Modal visible={legalType !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingTop: insets.top || Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {legalType === 'tos' ? 'Terms of Service' : 'Privacy Policy'}
            </Text>
            <TouchableOpacity onPress={() => setLegalType(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textMid} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {legalType && <LegalContent type={legalType} />}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingTop: Spacing.xxxl + 20 },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm, marginBottom: Spacing.xl },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl },
  sectionLabel: { fontFamily: FontFamily.medium, fontSize: FontSize.xs, marginBottom: Spacing.sm, marginTop: Spacing.lg, textTransform: 'uppercase' },
  section: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1 },
  rowLabel: { fontFamily: FontFamily.regular, fontSize: FontSize.md, flex: 1 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.xxl,
  },
  logoutText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.xxxl,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  modalTitle: { fontFamily: FontFamily.bold, fontSize: FontSize.xl },
  modalContent: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxxl },
  planBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  deleteWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  deleteWarningText: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, flex: 1, lineHeight: 20 },
  deleteSubheading: { fontFamily: FontFamily.medium, fontSize: FontSize.md, marginBottom: Spacing.lg },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  reasonText: { fontFamily: FontFamily.regular, fontSize: FontSize.md, flex: 1 },
  feedbackLabel: { fontFamily: FontFamily.medium, fontSize: FontSize.sm, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  feedbackInput: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 100,
  },
  confirmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxxl,
  },
  confirmDeleteText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md, color: '#fff' },
});
