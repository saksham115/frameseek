import { useEffect } from "react";
import LogoIcon from "@/components/LogoIcon";
import AmbientBackground from "@/components/AmbientBackground";
import { API_BASE_URL } from "@/lib/config";

const Login = () => {
  useEffect(() => {
    document.title = "Sign in — FrameSeek";
  }, []);

  // Standard web OAuth redirect: the backend starts the Google flow and sets httpOnly
  // session cookies on return. No client-side token handling.
  const signInWithGoogle = () => {
    window.location.href = `${API_BASE_URL}/auth/google/start`;
  };

  return (
    <div className="min-h-screen relative grid place-items-center px-4">
      <AmbientBackground />
      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <LogoIcon size={56} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">FrameSeek</h1>
        <p className="text-muted-foreground mb-8 text-balance">
          Find any moment in your videos by describing it.
        </p>

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3 font-medium transition-colors hover:border-primary"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.54 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z" />
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-xs text-muted-foreground">
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default Login;
