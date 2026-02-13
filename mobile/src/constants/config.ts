export const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api/v1'
  : 'https://api.frameseek.com/api/v1';

export const STORAGE_BASE_URL = __DEV__
  ? 'http://localhost:8000/storage'
  : 'https://api.frameseek.com/storage';

export const SEARCH_DEBOUNCE_MS = 600;
export const MAX_UPLOAD_SIZE_MB = 500;
