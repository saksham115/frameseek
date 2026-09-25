// Lets code outside the React tree (toasts fired from stores) route in-app without a reload.
let navigator: ((to: string) => void) | null = null;

export function setAppNavigator(fn: ((to: string) => void) | null) {
  navigator = fn;
}

export function navigateTo(to: string) {
  if (navigator) navigator(to);
  else window.location.assign(to);
}

export const SEARCH_INPUT_ID = "visual-search-input";

// Where to land after signing in. Kept in sessionStorage because the Google OAuth
// round trip leaves the SPA and the API always redirects back to the site root.
const RETURN_KEY = "frameseek:return-to";

export function rememberReturnPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return;
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* storage unavailable: fall back to the library */
  }
}

export function takeReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
