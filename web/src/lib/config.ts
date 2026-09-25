// In dev, Vite proxies /api to the backend (see vite.config.ts). In prod, same-origin
// behind Front Door, so a relative base works everywhere and keeps cookies first-party.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const THEME_STORAGE_KEY = "frameseek-theme";
