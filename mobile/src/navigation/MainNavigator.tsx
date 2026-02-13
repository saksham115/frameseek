import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList } from '../types/navigation.types';
import DashboardScreen from '../screens/home/DashboardScreen';
import SearchScreen from '../screens/home/SearchScreen';
import VideosScreen from '../screens/videos/VideosScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { useTheme } from '../hooks/useTheme';
import { FontFamily, FontSize } from '../constants/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 85,
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textMid,
        tabBarLabelStyle: {
          fontFamily: FontFamily.medium,
          fontSize: FontSize.xs,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Search') iconName = 'search';
          else if (route.name === 'Videos') iconName = 'videocam';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Videos" component={VideosScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
