import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type AuthStackParamList = {
  Login: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Search: undefined;
  Videos: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  MainTabs: undefined | { screen?: string };
  VideoDetail: { videoId: string; searchQuery?: string; searchResults?: import('./api.types').SearchResultData[] };
  Upload: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

// Screen props
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type DashboardScreenProps = BottomTabScreenProps<MainTabParamList, 'Dashboard'>;
export type SearchScreenProps = BottomTabScreenProps<MainTabParamList, 'Search'>;
export type VideosScreenProps = BottomTabScreenProps<MainTabParamList, 'Videos'>;
export type SettingsScreenProps = BottomTabScreenProps<MainTabParamList, 'Settings'>;
export type VideoDetailScreenProps = NativeStackScreenProps<AppStackParamList, 'VideoDetail'>;
export type UploadScreenProps = NativeStackScreenProps<AppStackParamList, 'Upload'>;
export type ProfileScreenProps = NativeStackScreenProps<AppStackParamList, 'Profile'>;
