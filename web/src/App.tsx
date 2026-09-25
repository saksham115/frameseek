import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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

const App = () => {
  const { status, loadSession, setAnonymous } = useAuth();

  useEffect(() => {
    setAuthFailureHandler(setAnonymous);
    loadSession();
  }, [loadSession, setAnonymous]);

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
        <Route path="*" element={<Navigate to="/login" replace />} />
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
