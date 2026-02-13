import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/slices/authSlice';
import { FontFamily, FontSize, Spacing } from '../../constants/theme';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';
import type { LoginScreenProps } from '../../types/navigation.types';

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { colors } = useTheme();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.detail || 'Login failed');
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
          <FrameSeekIcon size={56} />
          <Text style={[styles.logo]}>
            <Text style={{ color: colors.text }}>Frame</Text>
            <Text style={{ color: colors.amber }}>Seek</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMid }]}>Find any moment in your videos</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            isPassword
            autoComplete="password"
          />
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <Button title="Sign In" onPress={handleLogin} loading={loading} disabled={!email || !password} />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={[styles.link, { color: colors.textMid }]}>Forgot password?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={[styles.link, { color: colors.amber }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
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
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  logo: {
    fontFamily: FontFamily.bold,
    fontSize: 40,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  link: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
  },
});
