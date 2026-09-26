import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Focus, ScanLine } from "lucide-react";
import LogoIcon from "@/components/LogoIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { API_BASE_URL } from "@/lib/config";
export default function Login() {
  useEffect(() => {
    document.title = "Sign in | FrameSeek";
  }, []);
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="studio-brand">
          <LogoIcon size={36} />
          <span>
            frameseek<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="login-manifesto">
          <p className="eyebrow">FOR THE MOMENTS WORTH FINDING</p>
          <h1>
            Your footage.
            <br />A world of
            <br />
            <span>possibilities.</span>
          </h1>
          <p>
            Find the frame. Follow the feeling.
            <br />
            Make something worth watching.
          </p>
        </div>
        <div className="login-art" aria-hidden="true">
          <div className="art-frame art-back" />
          <div className="art-frame art-front">
            <span className="art-corner c1" />
            <span className="art-corner c2" />
            <span className="art-corner c3" />
            <span className="art-corner c4" />
            <div className="art-orb" />
            <Focus size={34} strokeWidth={0.8} />
            <span className="art-label">A DIFFERENT WAY TO SEE</span>
          </div>
          <div className="art-track">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="login-story-footer">
          <span>YOUR CREATIVE WORKSPACE</span>
          <ScanLine size={17} />
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-theme">
          <ThemeToggle />
        </div>
        <div className="login-form">
          <div className="login-welcome-mark">
            <ArrowUpRight size={25} strokeWidth={1.2} />
          </div>
          <p className="eyebrow">
            A LITTLE LESS SEARCHING. A LITTLE MORE CREATING.
          </p>
          <h2>
            Welcome to your
            <br />
            next great story.
          </h2>
          <p>Sign in to bring your content into focus.</p>
          <button
            className="google-signin"
            onClick={() => {
              window.location.href = `${API_BASE_URL}/auth/google/start`;
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.62 0 3.06 1.06 4.21 1.64l3.15-3.15C17.45 1.54 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z"
              />
            </svg>
            Continue with Google
            <ArrowUpRight size={15} />
          </button>
          <div className="login-note">
            <span />
            <p>One account. All your creative moments.</p>
            <span />
          </div>
          <p className="login-small">
            Your videos and workspace stay private to you.
          </p>
          <p className="login-legal">
            New here? You’ll be asked to accept our{" "}
            <Link to="/terms">Terms of Service</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link> before you start.
          </p>
        </div>
        <p className="login-copyright">
          FRAMESEEK <span> / </span> FIND YOUR FOCUS.
        </p>
      </section>
    </div>
  );
}
