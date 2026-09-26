import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  Film,
  FolderOpen,
  HardDrive,
  LogOut,
  Menu,
  Search,
  Settings2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import LogoIcon from "@/components/LogoIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/store/auth";
import { formatBytes } from "@/lib/format";
import { SEARCH_INPUT_ID, setAppNavigator } from "@/lib/navigation";
import { isActiveUpload, useUploads } from "@/store/uploads";
import { useTour } from "@/store/tour";
import FeedbackDialog from "@/components/FeedbackDialog";
import ProductTour from "@/components/ProductTour";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Media library", icon: FolderOpen, end: true, tour: "nav-library" },
  { to: "/search", label: "Visual search", icon: Search, end: false, tour: "nav-search" },
  { to: "/upload", label: "Import media", icon: Upload, end: false, tour: "nav-import" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isEditor = location.pathname.startsWith("/videos/");
  const pageName = isEditor
    ? "Video workspace"
    : ({
        "/": "Media library",
        "/search": "Visual search",
        "/upload": "Import media",
        "/settings": "Settings",
        "/upgrade": "Plans",
      }[location.pathname] ?? "Workspace");
  const uploads = useUploads((s) => s.items);
  const activeUploads = uploads.filter(isActiveUpload);
  const uploadBytes = activeUploads.reduce((n, i) => n + i.file.size, 0);
  const uploadPercent = uploadBytes
    ? Math.round(
        activeUploads.reduce((n, i) => n + (i.file.size * i.progress) / 100, 0) /
          uploadBytes *
          100,
      )
    : 0;
  const storagePercent = user?.storage_limit_bytes
    ? Math.min(100, (user.storage_used_bytes / user.storage_limit_bytes) * 100)
    : 0;
  const initials = (user?.name || user?.email || "U")
    .split(/[ @]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = document.activeElement as HTMLElement;
    const sidebar = sidebarRef.current;
    const body = bodyRef.current;
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled)",
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
    if (body) body.inert = true;
    focusable()[0]?.focus();
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 900px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", trapFocus);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      if (body) body.inert = false;
      window.removeEventListener("keydown", trapFocus);
      desktop.removeEventListener("change", closeOnDesktop);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [menuOpen]);
  useEffect(() => {
    setMenuOpen(false);
    document.title = `${pageName} | FrameSeek`;
  }, [location.pathname, pageName]);
  // First visit after accepting the terms: show the product tour once.
  const tourAutoStarted = useRef(false);
  useEffect(() => {
    if (!user || user.tour_completed_at) return;
    // Mark as started only when it actually opens, so a remount doesn't cancel it.
    const t = setTimeout(() => {
      if (tourAutoStarted.current) return;
      tourAutoStarted.current = true;
      useTour.getState().start();
    }, 400);
    return () => clearTimeout(t);
  }, [user?.id, user?.tour_completed_at]);
  useEffect(() => {
    setAppNavigator(navigate);
    return () => setAppNavigator(null);
  }, [navigate]);
  // Closing or reloading the tab kills in-flight uploads; ask first.
  const uploading = activeUploads.length > 0;
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);
  const openSearch = () => {
    const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    } else navigate("/search");
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [navigate]);

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={cn("studio-sidebar", menuOpen && "is-open")}
        aria-label="Workspace sidebar"
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen || undefined}
      >
        <button
          className="icon-button mobile-menu sidebar-close"
          aria-label="Close workspace navigation"
          onClick={() => setMenuOpen(false)}
        >
          <X size={18} />
        </button>
        <NavLink to="/" className="studio-brand">
          <LogoIcon size={33} />
          <span>
            frameseek<span className="brand-dot">.</span>
          </span>
        </NavLink>
        <div className="workspace-label">
          <div className="workspace-glyph">
            <Film size={16} />
          </div>
          <div>
            <strong>Personal workspace</strong>
            <span>Your creative space</span>
          </div>
          <span className="workspace-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {NAV.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={({ isActive }) =>
                cn(
                  "studio-nav",
                  (isActive || (to === "/" && isEditor)) && "active",
                )
              }
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{label}</span>
              {to === "/search" && <span className="nav-new">AI</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-line" />
          <p>
            Good stories start
            <br />
            with the right frame.
          </p>
        </div>
        <div className="sidebar-bottom">
          <NavLink
            to="/settings"
            data-tour="storage"
            className={cn(
              "storage-widget",
              storagePercent >= 85 && "is-warning",
              storagePercent >= 99 && "is-full",
            )}
            aria-label={`Workspace storage settings, ${Math.round(storagePercent)}% used`}
          >
            <div className="flex justify-between items-center">
              <span>
                {storagePercent >= 85 ? (
                  <AlertTriangle size={13} />
                ) : (
                  <HardDrive size={13} />
                )}{" "}
                {storagePercent >= 99
                  ? "Storage full"
                  : storagePercent >= 85
                    ? "Storage almost full"
                    : "Workspace storage"}
              </span>
              <ArrowUpRight size={13} />
            </div>
            <div className="storage-track">
              <span style={{ width: `${storagePercent}%` }} />
            </div>
            <p>
              {formatBytes(user?.storage_used_bytes ?? 0)}{" "}
              <span>of {formatBytes(user?.storage_limit_bytes ?? 0)}</span>
            </p>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn("studio-nav", isActive && "active")}
          >
            <Settings2 size={17} strokeWidth={1.7} />
            <span>Settings</span>
          </NavLink>
          <div className="sidebar-account">
            <NavLink to="/settings" className="account-link">
              <div className="avatar-tile">{initials}</div>
              <div>
                <strong>{user?.name?.split(" ")[0] || "Your account"}</strong>
                <span>{user?.plan || "Free"} workspace</span>
              </div>
            </NavLink>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="studio-body" ref={bodyRef}>
        <header className="studio-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="icon-button mobile-menu"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="breadcrumbs">
              <span>Workspace</span>
              <ChevronRight size={12} />
              <strong>{pageName}</strong>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {uploading && location.pathname !== "/upload" && (
              <NavLink
                to="/upload"
                className="topbar-uploads"
                aria-label={`${activeUploads.length} uploads in progress, ${uploadPercent}% done`}
              >
                <UploadCloud size={14} />
                <span>
                  Uploading {activeUploads.length > 1 ? `${activeUploads.length} · ` : ""}
                  {uploadPercent}%
                </span>
                <span className="topbar-uploads-bar" aria-hidden="true">
                  <span style={{ width: `${uploadPercent}%` }} />
                </span>
              </NavLink>
            )}
            <FeedbackDialog />
            <button
              className="topbar-search"
              data-tour="search"
              onClick={openSearch}
              aria-label="Search your videos"
            >
              <Search size={15} />
              <span>Find a moment</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <ThemeToggle />
            <NavLink
              to="/settings"
              className="topbar-avatar"
              aria-label="Account settings"
            >
              {initials}
            </NavLink>
          </div>
        </header>
        <main
          id="workspace"
          tabIndex={-1}
          className={cn("studio-main", isEditor && "studio-main-editor")}
        >
          <Outlet />
        </main>
        <ProductTour />
      </div>
    </div>
  );
}
