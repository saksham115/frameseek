export const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api/v1'
  : 'https://api.frameseek.com/api/v1';

export const STORAGE_BASE_URL = __DEV__
  ? 'http://localhost:8000/storage'
  : 'https://api.frameseek.com/storage';

export const SEARCH_DEBOUNCE_MS = 600;
export const MAX_UPLOAD_SIZE_MB = 500;

// Google Sign-In — replace with your own client IDs from Google Cloud Console
export const GOOGLE_WEB_CLIENT_ID = '183408673573-qc4jua4selmkrqo4dgl7en099vbb2314.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '183408673573-3vs2is72v9s4dgl8if0bmcpb818hh3hi.apps.googleusercontent.com';
