import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useAuthStore } from '../../store/slices/authSlice';
import { useUIStore } from '../../store/slices/uiSlice';
import type { AppStackParamList } from '../../types/navigation.types';

export default function SettingsScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { themePreference, setThemePreference } = useUIStore();

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
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

      {/* Account */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>Account</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow icon="person" label={user?.name || 'Profile'} onPress={() => navigation.navigate('Profile')} />
        <SettingsRow icon="mail" label={user?.email || 'Email'} />
        <SettingsRow icon="shield" label={`${user?.plan_type || 'free'} plan`} />
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

      {/* Processing */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>Processing</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow icon="speedometer" label="Default frame interval: 2s" />
        <SettingsRow icon="flash" label="Auto-process uploads: Off" />
      </View>

      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.textMid }]}>About</Text>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingsRow icon="information-circle" label="Version 1.0.0" />
        <SettingsRow icon="document-text" label="Terms of Service" />
        <SettingsRow icon="lock-closed" label="Privacy Policy" />
      </View>

      {/* Logout */}
      <TouchableOpacity onPress={logout} style={[styles.logoutBtn, { borderColor: colors.error + '44' }]}>
        <Ionicons name="log-out" size={20} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, paddingTop: Spacing.xxxl + 20 },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl, marginBottom: Spacing.xl },
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
});
