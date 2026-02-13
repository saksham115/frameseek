import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/slices/authSlice';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../../constants/config';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';

export default function LoginScreen() {
  const { colors } = useTheme();
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;

      if (!idToken) {
        Alert.alert('Sign-In Error', 'No ID token received from Google.');
        return;
      }

      const name = response.data?.user?.name ?? undefined;
      await googleSignIn(idToken, name);
    } catch (err: any) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED) {
          // User cancelled — do nothing
          return;
        }
        if (err.code === statusCodes.IN_PROGRESS) {
          return;
        }
      }
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        'Sign in failed. Please try again.';
      Alert.alert('Sign-In Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <FrameSeekIcon size={56} />
        <Text style={styles.logo}>
          <Text style={{ color: colors.text }}>Frame</Text>
          <Text style={{ color: colors.amber }}>Seek</Text>
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMid }]}>
          Find any moment in your videos
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.googleButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handleGoogleSignIn}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Ionicons name="logo-google" size={20} color={colors.text} />
        <Text style={[styles.googleButtonText, { color: colors.text }]}>
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  googleButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
  },
});
