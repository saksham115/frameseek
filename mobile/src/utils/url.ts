import { STORAGE_BASE_URL } from '../constants/config';

/**
 * Resolve a media URL from the API response.
 * - Signed GCS URLs (https://...) are returned as-is.
 * - Local relative paths (/storage/...) are prefixed with STORAGE_BASE_URL.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${STORAGE_BASE_URL}${url.replace(/^\/storage/, '')}`;
}
