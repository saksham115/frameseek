import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { setAuthFailureHandler } from "@/api/client";
import AppShell from "@/components/AppShell";
import LogoIcon from "@/components/LogoIcon";
import Login from "@/pages/Login";
import Library from "@/pages/Library";
import Search from "@/pages/Search";
import Upload from "@/pages/Upload";
import VideoDetail from "@/pages/VideoDetail";
import Settings from "@/pages/Settings";
import Paywall from "@/pages/Paywall";
import NotFound from "@/pages/NotFound";
import { rememberReturnPath, takeReturnPath } from "@/lib/navigation";

/** Sends anonymous visitors to sign in, remembering the page they were trying to open. */
function RedirectToLogin() {
  const location = useLocation();
  rememberReturnPath(location.pathname + location.search + location.hash);
  return <Navigate to="/login" replace />;
}

const App = () => {
  const { status, loadSession, setAnonymous } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setAuthFailureHandler(setAnonymous);
    loadSession();
  }, [loadSession, setAnonymous]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const path = takeReturnPath();
    if (path) navigate(path, { replace: true });
  }, [status, navigate]);

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="flex flex-col items-center gap-5">
          <LogoIcon size={44} />
          <span className="font-mono text-xs text-muted-foreground animate-pulse">
            Opening your workspace…
          </span>
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<RedirectToLogin />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Library />} />
        <Route path="/search" element={<Search />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/videos/:id" element={<VideoDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/upgrade" element={<Paywall />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default App;
