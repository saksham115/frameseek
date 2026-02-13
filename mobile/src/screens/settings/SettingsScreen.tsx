import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
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
import type { AppStackParamList } from '../../types/navigation.types';

export default function SettingsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { themePreference, setThemePreference } = useUIStore();
  const [legalType, setLegalType] = useState<'tos' | 'privacy' | null>(null);

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
        <SettingsRow icon="shield" label={`${(user?.plan_type || 'free').charAt(0).toUpperCase() + (user?.plan_type || 'free').slice(1)} Plan`} />
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
    marginBottom: Spacing.xxxl,
  },
  logoutText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md },
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
});
