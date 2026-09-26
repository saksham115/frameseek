import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/lib/config";

// Sessions are httpOnly cookies (access + refresh). The browser sends them automatically;
// no tokens ever touch JS, which removes the XSS token-theft risk the mobile app carried.
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Single-flight refresh: many requests can 401 at once, but only one /auth/refresh runs.
// This fixes the refresh race that could force-log-out users in the old client.
let refreshInFlight: Promise<void> | null = null;

async function refreshSession(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = api
      .post("/auth/refresh")
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Callback invoked when refresh fails terminally, so the app can drop to the login screen.
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

// Invoked when the API refuses a call because the Terms haven't been accepted (e.g. a
// stale tab from before acceptance was required), so the app can show the terms gate.
let onTermsRequired: (() => void) | null = null;
export function setTermsRequiredHandler(fn: () => void) {
  onTermsRequired = fn;
}

api.interceptors.response.use(
  (res) => {
    // The API wraps payloads in { success, data, meta }. Unwrap to the inner data so
    // callers work with the payload directly.
    const body = res.data;
    if (body && typeof body === "object" && "success" in body && "data" in body) {
      res.data = (body as { data: unknown }).data;
    }
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes("/auth/refresh") || original?.url?.includes("/auth/login");

    if (error.response?.status === 403 && error.response.headers["x-requires-acceptance"]) {
      onTermsRequired?.();
    }
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        onAuthFailure?.();
      }
    }
    return Promise.reject(error);
  },
);
