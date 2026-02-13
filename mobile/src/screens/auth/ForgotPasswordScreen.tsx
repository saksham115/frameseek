import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import type { ForgotPasswordScreenProps } from '../../types/navigation.types';

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    // In production, this would call an API endpoint
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={[styles.title, { color: colors.text, marginTop: Spacing.lg }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: colors.textMid }]}>
              We sent a password reset link to {email}
            </Text>
            <Button title="Back to Login" onPress={() => navigation.goBack()} variant="secondary" style={{ marginTop: Spacing.xxl }} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Reset Password</Text>
              <Text style={[styles.subtitle, { color: colors.textMid }]}>
                Enter your email and we'll send you a reset link
              </Text>
            </View>
            <Input label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Button title="Send Reset Link" onPress={handleSubmit} disabled={!email} />
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
              <Text style={[styles.link, { color: colors.textMid }]}>Back to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxl,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },
  successContainer: {
    alignItems: 'center',
  },
  back: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  link: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
  },
});
