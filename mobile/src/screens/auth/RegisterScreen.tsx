import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/slices/authSlice';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';
import type { RegisterScreenProps } from '../../types/navigation.types';

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const { colors } = useTheme();
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <FrameSeekIcon size={40} />
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textMid }]}>Join FrameSeek and start searching your videos</Text>
        </View>

        <View style={styles.form}>
          <Input label="Name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Input label="Password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} isPassword />
          <Input label="Confirm Password" placeholder="Confirm your password" value={confirmPassword} onChangeText={setConfirmPassword} isPassword />
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <Button title="Create Account" onPress={handleRegister} loading={loading} disabled={!name || !email || !password} />
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.footer}>
          <Text style={[styles.link, { color: colors.textMid }]}>
            Already have an account? <Text style={{ color: colors.amber }}>Sign In</Text>
          </Text>
        </TouchableOpacity>
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
    gap: Spacing.sm,
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
  form: {
    marginBottom: Spacing.xl,
  },
  error: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  link: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
  },
});
