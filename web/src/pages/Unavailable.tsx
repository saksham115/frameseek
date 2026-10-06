import { useEffect } from "react";
import { Globe2, RefreshCw } from "lucide-react";
import LogoIcon from "@/components/LogoIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { PRIVACY_CONTACT } from "@/lib/legal";

/**
 * Shown when the API refuses a request because it came from outside India, which is the
 * only country FrameSeek is offered in. Renders without calling the API, so it still
 * works for a visitor who cannot reach anything else.
 */
export default function Unavailable() {
  useEffect(() => {
    document.title = "Not available in your region | FrameSeek";
  }, []);

  return (
    <div className="min-h-screen px-6 py-7">
      <header className="flex items-center justify-between">
        <div className="studio-brand">
          <LogoIcon size={30} />
          <span>
            frameseek<span className="brand-dot">.</span>
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-xl place-items-start gap-6 pt-[14vh]">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
          <Globe2 size={23} strokeWidth={1.3} />
        </span>
        <div className="space-y-4">
          <p className="eyebrow">NOT AVAILABLE IN YOUR REGION</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            FrameSeek is only available in India.
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Your connection looks like it is outside India, so we couldn’t open
            your workspace. Nothing is wrong with your account: it will be here
            when you are back.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If you are in India and still seeing this, a VPN or a proxy is the
            usual cause. Turn it off and reload. If that doesn’t help, write to{" "}
            <a className="text-primary hover:underline" href={`mailto:${PRIVACY_CONTACT}`}>
              {PRIVACY_CONTACT}
            </a>{" "}
            and we will look into it.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={15} />
          Try again
        </button>
      </main>
    </div>
  );
}
