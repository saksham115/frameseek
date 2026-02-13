import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import Button from '../common/Button';
import LegalContent from './LegalContent';

interface TosAcceptanceModalProps {
  visible: boolean;
  onAccept: () => void;
  loading?: boolean;
}

export default function TosAcceptanceModal({ visible, onAccept, loading = false }: TosAcceptanceModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={28} color={colors.amber} />
          <Text style={[styles.title, { color: colors.text }]}>Terms & Privacy</Text>
          <Text style={[styles.subtitle, { color: colors.textMid }]}>
            Please review and accept our terms to continue using FrameSeek.
          </Text>
        </View>

        {/* Scrollable legal content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Terms of Service</Text>
          <LegalContent type="tos" />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy Policy</Text>
          <LegalContent type="privacy" />
        </ScrollView>

        {/* Footer with checkbox and button */}
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
          <TouchableOpacity
            onPress={() => setAgreed(!agreed)}
            activeOpacity={0.7}
            style={styles.checkboxRow}
          >
            <View style={[
              styles.checkbox,
              {
                borderColor: agreed ? colors.amber : colors.textDim,
                backgroundColor: agreed ? colors.amber : 'transparent',
              },
            ]}>
              {agreed && <Ionicons name="checkmark" size={14} color="#0A0A0B" />}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>
              I have read and agree to the Terms of Service and Privacy Policy
            </Text>
          </TouchableOpacity>

          <Button
            title="Accept & Continue"
            onPress={onAccept}
            size="lg"
            disabled={!agreed}
            loading={loading}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.xs,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxl,
    marginTop: Spacing.sm,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  sectionTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.lg,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xl,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    flex: 1,
  },
});
