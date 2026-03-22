import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../store/slices/authSlice';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../../constants/config';
import FrameSeekIcon from '../../components/common/FrameSeekIcon';

export default function LoginScreen() {
  const { colors } = useTheme();
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const appleSignIn = useAuthStore((s) => s.appleSignIn);
  const demoSignIn = useAuthStore((s) => s.demoSignIn);
  const [loading, setLoading] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });

    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
    }
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

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert('Sign-In Error', 'No identity token received from Apple.');
        return;
      }

      const name = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ') || undefined
        : undefined;

      await appleSignIn(credential.identityToken, name);
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        return;
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

  const handleDemoSignIn = async () => {
    setLoading(true);
    try {
      await demoSignIn('saksham115test@gmail.com', 'testing@1850');
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        'Demo sign in failed.';
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

      <View style={styles.buttons}>
        {appleAuthAvailable && (
          <TouchableOpacity
            style={[styles.appleButton, { backgroundColor: colors.text }]}
            onPress={handleAppleSignIn}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-apple" size={20} color={colors.background} />
            <Text style={[styles.appleButtonText, { color: colors.background }]}>
              {loading ? 'Signing in\u2026' : 'Sign in with Apple'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.googleButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Ionicons name="logo-google" size={20} color={colors.text} />
          <Text style={[styles.googleButtonText, { color: colors.text }]}>
            {loading ? 'Signing in\u2026' : 'Sign in with Google'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.demoButton}
          onPress={handleDemoSignIn}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={[styles.demoButtonText, { color: colors.textMid }]}>
            Demo Login
          </Text>
        </TouchableOpacity>
      </View>
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
  buttons: {
    gap: Spacing.md,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  appleButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
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
  demoButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  demoButtonText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
  },
});
