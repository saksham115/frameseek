import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '../../constants/legal';

interface LegalContentProps {
  type: 'tos' | 'privacy';
}

export default function LegalContent({ type }: LegalContentProps) {
  const { colors } = useTheme();
  const content = type === 'tos' ? TERMS_OF_SERVICE : PRIVACY_POLICY;

  return (
    <View style={styles.container}>
      <Text style={[styles.lastUpdated, { color: colors.textDim }]}>
        Last updated: {content.lastUpdated}
      </Text>
      {content.sections.map((section, index) => (
        <View key={index} style={styles.section}>
          <Text style={[styles.heading, { color: colors.text }]}>{section.heading}</Text>
          <Text style={[styles.body, { color: colors.textMid }]}>{section.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.lg },
  lastUpdated: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, fontStyle: 'italic' },
  section: { gap: Spacing.xs },
  heading: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  body: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, lineHeight: 20 },
});
