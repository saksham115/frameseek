import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LegalText from "@/components/LegalText";
import LogoIcon from "@/components/LogoIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";
import { useAuth } from "@/store/auth";

/** Public /terms and /privacy pages, readable signed in or not. */
export default function Legal({ kind }: { kind: "terms" | "privacy" }) {
  const doc = kind === "terms" ? TERMS_OF_SERVICE : PRIVACY_POLICY;
  const signedIn = useAuth((s) => s.status === "authenticated");
  useEffect(() => {
    document.title = `${doc.title} — FrameSeek`;
    window.scrollTo(0, 0);
  }, [doc.title]);
  return (
    <div className="legal-page">
      <header className="terms-gate-top">
        <Link to="/" className="studio-brand">
          <LogoIcon size={30} />
          <span>
            frameseek<span className="brand-dot">.</span>
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="legal-page-body">
        <Link to={signedIn ? "/settings" : "/login"} className="legal-back">
          <ArrowLeft size={13} /> {signedIn ? "Back to FrameSeek" : "Back to sign in"}
        </Link>
        <h1>{doc.title}</h1>
        <LegalText doc={doc} />
        <p className="legal-switch">
          See also the{" "}
          <Link to={kind === "terms" ? "/privacy" : "/terms"}>
            {kind === "terms" ? PRIVACY_POLICY.title : TERMS_OF_SERVICE.title}
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
