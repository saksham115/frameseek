import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useImportDialog } from "@/store/importDialog";
import { useAuth } from "@/store/auth";
import { setAuthFailureHandler, setTermsRequiredHandler } from "@/api/client";
import AppShell from "@/components/AppShell";
import LogoIcon from "@/components/LogoIcon";
import Login from "@/pages/Login";
import Library from "@/pages/Library";
import Search from "@/pages/Search";
import VideoDetail from "@/pages/VideoDetail";
import Settings from "@/pages/Settings";
import Paywall from "@/pages/Paywall";
import NotFound from "@/pages/NotFound";
import Legal from "@/pages/Legal";
import TermsGate from "@/components/TermsGate";
import { rememberReturnPath, takeReturnPath } from "@/lib/navigation";

/** Old /upload links: show the library with the Import dialog open. */
function OpenImportDialog() {
  const [params] = useSearchParams();
  const folder = params.get("folder");
  useEffect(() => {
    useImportDialog.getState().show(folder);
  }, [folder]);
  return <Navigate to={folder ? `/?folder=${folder}` : "/"} replace />;
}

/** Sends anonymous visitors to sign in, remembering the page they were trying to open. */
function RedirectToLogin() {
  const location = useLocation();
  rememberReturnPath(location.pathname + location.search + location.hash);
  return <Navigate to="/login" replace />;
}

const App = () => {
  const { status, user, loadSession, setAnonymous } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setAuthFailureHandler(setAnonymous);
    setTermsRequiredHandler(loadSession);
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
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="*" element={<RedirectToLogin />} />
      </Routes>
    );
  }

  // Until the Terms and Privacy Policy are accepted, nothing else renders. The URL is
  // left alone so the user lands where they were headed once they accept.
  if (!user?.tos_accepted_at) {
    return (
      <Routes>
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="*" element={<TermsGate />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/terms" element={<Legal kind="terms" />} />
      <Route path="/privacy" element={<Legal kind="privacy" />} />
      <Route element={<AppShell />}>
        <Route index element={<Library />} />
        <Route path="/search" element={<Search />} />
        <Route path="/upload" element={<OpenImportDialog />} />
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
