import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/config";

const THEME_EVENT = "frameseek-theme-change";
const currentTheme = () =>
  document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme);
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return (
    <button
      className="theme-toggle"
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
