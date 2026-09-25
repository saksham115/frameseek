import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut, Search, Upload, Video, Settings as SettingsIcon } from "lucide-react";
import LogoIcon from "@/components/LogoIcon";
import AmbientBackground from "@/components/AmbientBackground";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Library", icon: Video, end: true },
  { to: "/search", label: "Search", icon: Search, end: false },
  { to: "/upload", label: "Upload", icon: Upload, end: false },
];

const AppShell = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{ background: "var(--nav-bg)" }}
      >
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 md:py-0">
          <NavLink to="/" className="flex items-center gap-2.5">
            <LogoIcon size={30} />
            <span className="font-bold tracking-tight text-lg">FrameSeek</span>
          </NavLink>

          <nav aria-label="Main navigation" className="order-last flex w-full items-center justify-center gap-1 md:order-none md:w-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NavLink to="/settings" aria-label="Settings">
              <SettingsIcon className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sign out"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{user?.name?.split(" ")[0] ?? "Sign out"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container relative z-10 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
