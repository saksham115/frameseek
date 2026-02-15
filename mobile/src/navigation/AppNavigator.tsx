import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../types/navigation.types';
import MainNavigator from './MainNavigator';
import VideoDetailScreen from '../screens/videos/VideoDetailScreen';
import UploadScreen from '../screens/videos/UploadScreen';
import ProfileScreen from '../screens/settings/ProfileScreen';
import ClipGenerateScreen from '../screens/clips/ClipGenerateScreen';
import ClipDetailScreen from '../screens/clips/ClipDetailScreen';
import { useTheme } from '../hooks/useTheme';
import { FontFamily } from '../constants/theme';

const Stack = createNativeStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: FontFamily.semiBold },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="VideoDetail" component={VideoDetailScreen} options={{ title: 'Video' }} />
      <Stack.Screen name="Upload" component={UploadScreen} options={{ presentation: 'modal', title: 'Upload Video' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="ClipGenerate" component={ClipGenerateScreen} options={{ presentation: 'modal', title: 'Generate Clip' }} />
      <Stack.Screen name="ClipDetail" component={ClipDetailScreen} options={{ title: 'Clip' }} />
    </Stack.Navigator>
  );
}
