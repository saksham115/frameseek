import { isAxiosError, isCancel } from "axios";

/** HTTP status of a failed API call, if the server answered. */
export function errorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

export function isAbort(error: unknown): boolean {
  return isCancel(error) || (error instanceof DOMException && error.name === "AbortError");
}

/**
 * A human message for a failed request: the API's own `detail` when it sent one,
 * a connectivity hint when the request never got an answer, else the fallback.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  if (!error.response) {
    return navigator.onLine
      ? `${fallback} Check your connection and try again.`
      : "You’re offline. Reconnect and try again.";
  }
  const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" && detail.length < 200 ? detail : fallback;
}
