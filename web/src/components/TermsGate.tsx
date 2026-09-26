import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { acceptTerms } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import LegalText from "@/components/LegalText";
import LogoIcon from "@/components/LogoIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { apiErrorMessage } from "@/lib/errors";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

/**
 * Shown after sign-in until the user accepts the Terms and Privacy Policy. Nothing else
 * in the app renders before then (and the API refuses everything but auth calls).
 */
export default function TermsGate() {
  const { user, logout, setUser } = useAuth();
  const [doc, setDoc] = useState<"terms" | "privacy">("terms");
  const [agreed, setAgreed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accept = useMutation({
    mutationFn: acceptTerms,
    onSuccess: (updated) => setUser(updated),
    onError: (e) =>
      toast.error(apiErrorMessage(e, "We couldn’t save your acceptance.")),
  });

  useEffect(() => {
    document.title = "Terms & Privacy | FrameSeek";
  }, []);
  useEffect(() => scrollRef.current?.scrollTo({ top: 0 }), [doc]);

  const firstName = user?.name?.split(" ")[0];
  return (
    <div className="terms-gate">
      <header className="terms-gate-top">
        <div className="studio-brand">
          <LogoIcon size={30} />
          <span>
            frameseek<span className="brand-dot">.</span>
          </span>
        </div>
        <ThemeToggle />
      </header>
      <main className="terms-gate-panel" aria-labelledby="terms-gate-title">
        <p className="eyebrow">ONE LAST STEP</p>
        <h1 id="terms-gate-title">
          {firstName ? `Welcome, ${firstName}.` : "Welcome to FrameSeek."} Please
          review our terms.
        </h1>
        <p className="terms-gate-lede">
          To use FrameSeek you need to accept the Terms of Service and Privacy
          Policy. The short version:
        </p>
        <ul className="terms-gate-points">
          <li>
            <LockKeyhole size={14} /> Your videos stay yours and private to your
            account. We only process them to run FrameSeek for you.
          </li>
          <li>
            <ShieldCheck size={14} /> We don’t sell your data, show ads, or train AI
            models on your videos.
          </li>
          <li>
            <Trash2 size={14} /> Free-plan videos may be removed after 15 days, and
            you can delete everything at any time.
          </li>
        </ul>
        <div className="terms-gate-tabs" role="tablist" aria-label="Documents">
          {(
            [
              ["terms", TERMS_OF_SERVICE.title],
              ["privacy", PRIVACY_POLICY.title],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              id={`terms-tab-${id}`}
              aria-selected={doc === id}
              aria-controls="terms-gate-doc"
              className={cn(doc === id && "active")}
              onClick={() => setDoc(id)}
            >
              {label}
            </button>
          ))}
          <a
            className="terms-gate-open"
            href={doc === "terms" ? "/terms" : "/privacy"}
            target="_blank"
            rel="noreferrer"
          >
            Open in new tab <ExternalLink size={11} />
          </a>
        </div>
        <div
          ref={scrollRef}
          id="terms-gate-doc"
          role="tabpanel"
          aria-labelledby={`terms-tab-${doc}`}
          className="terms-gate-doc"
          tabIndex={0}
        >
          <LegalText doc={doc === "terms" ? TERMS_OF_SERVICE : PRIVACY_POLICY} headingLevel={3} />
        </div>
        <label className="terms-gate-agree">
          <Checkbox
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            aria-describedby="terms-gate-title"
          />
          <span>
            I have read and agree to the{" "}
            <a href="/terms" target="_blank" rel="noreferrer">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <div className="terms-gate-actions">
          <button className="terms-gate-signout" onClick={() => logout()}>
            Decline and sign out
          </button>
          <Button
            className="studio-button"
            disabled={!agreed || accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? "Saving…" : "Accept and continue"} <ArrowRight />
          </Button>
        </div>
      </main>
    </div>
  );
}
