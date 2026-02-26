import { Platform } from 'react-native';

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_BASE_URL = __DEV__
  ? `http://${DEV_HOST}:8000/api/v1`
  : 'https://api.frameseek.com/api/v1';

export const STORAGE_BASE_URL = __DEV__
  ? `http://${DEV_HOST}:8000/storage`
  : 'https://api.frameseek.com/storage';

export const SEARCH_DEBOUNCE_MS = 600;
export const MAX_UPLOAD_SIZE_MB = 500;

// Google Sign-In — replace with your own client IDs from Google Cloud Console
export const GOOGLE_WEB_CLIENT_ID = '183408673573-qc4jua4selmkrqo4dgl7en099vbb2314.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '183408673573-3vs2is72v9s4dgl8if0bmcpb818hh3hi.apps.googleusercontent.com';

// Subscription product IDs (must match App Store Connect)
export const PRODUCTS = {
  PRO_MONTHLY: 'frameseek_pro_monthly',
  PRO_ANNUAL: 'frameseek_pro_annual',
  PRO_MAX_MONTHLY: 'frameseek_promax_monthly',
  PRO_MAX_ANNUAL: 'frameseek_promax_annual',
} as const;
