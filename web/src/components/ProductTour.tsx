import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Scissors, Sparkles, X } from "lucide-react";
import { completeTour } from "@/api/auth";
import { Button } from "@/components/ui/button";
import LogoIcon from "@/components/LogoIcon";
import { useAuth } from "@/store/auth";
import { useTour } from "@/store/tour";
import { cn } from "@/lib/utils";

interface Step {
  /** `data-tour` value of the element to spotlight; omitted for centred steps. */
  target?: string;
  title: string;
  body: string;
  visual?: "welcome" | "shots";
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const STEPS: Step[] = [
  {
    title: "Welcome to FrameSeek",
    body: "Here’s a one-minute tour of the essentials. You can skip it any time and replay it later from Settings.",
    visual: "welcome",
  },
  {
    target: "nav-library",
    title: "Your media library",
    body: "Everything you import lives here. Filter by status, find videos by title, and group them into folders.",
  },
  {
    target: "nav-import",
    title: "Bring your footage in",
    body: "Upload MP4, MOV or WebM files, several at a time. Uploads keep going while you work elsewhere, then we index every frame and transcribe the speech.",
  },
  {
    target: "search",
    title: "Find any moment",
    body: `Describe what you remember, like “golden hour on the beach”, and jump straight to it. Press ${isMac ? "⌘K" : "Ctrl K"} from anywhere.`,
  },
  {
    title: "Cut clips from shots",
    body: "Open a video to play it, read its transcript, and see it split into shots of similar-looking frames. Pick a shot, fine-tune the range, and export an MP4.",
    visual: "shots",
  },
  {
    target: "storage",
    title: "Keep an eye on space",
    body: "Your plan’s storage and how much you’ve used. We’ll warn you before it fills up.",
  },
  {
    target: "feedback",
    title: "Tell us what you think",
    body: "Ideas, problems, anything else: send it here whenever you like. It goes straight to the FrameSeek team.",
  },
  {
    title: "You’re all set",
    body: "Start by importing a video. Processing takes a few minutes, then everything is searchable.",
  },
];

const GAP = 12;
const PAD = 6;

type Box = { top: number; left: number; width: number; height: number };

function visibleRect(target?: string): Box | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  const r = el?.getBoundingClientRect();
  // Off-canvas (e.g. the sidebar on phones) or hidden: show the step centred instead.
  if (!r || r.width === 0 || r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight)
    return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/** Place the card beside the spotlight: right, below, left, then above, kept on screen. */
function cardPosition(hole: Box, card: { width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, max: number) => Math.max(GAP, Math.min(v, max - GAP));
  const options = [
    { left: hole.left + hole.width + GAP, top: hole.top, fits: hole.left + hole.width + GAP + card.width <= vw - GAP },
    { left: hole.left, top: hole.top + hole.height + GAP, fits: hole.top + hole.height + GAP + card.height <= vh - GAP },
    { left: hole.left - GAP - card.width, top: hole.top, fits: hole.left - GAP - card.width >= GAP },
    { left: hole.left, top: hole.top - GAP - card.height, fits: hole.top - GAP - card.height >= GAP },
  ];
  const pick = options.find((o) => o.fits) ?? options[1];
  return {
    left: clamp(pick.left, vw - card.width),
    top: clamp(pick.top, vh - card.height),
  };
}

export default function ProductTour() {
  const { open, step, goTo, close } = useTour();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [hole, setHole] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = useCallback(
    (then?: string) => {
      close();
      if (then) navigate(then);
      // Recorded server-side so the tour doesn't reappear on other devices.
      if (!useAuth.getState().user?.tour_completed_at) {
        completeTour().then(setUser).catch(() => undefined);
      }
    },
    [close, navigate, setUser],
  );

  // Follow the target as the layout moves (resize, scroll, sidebar animation).
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const next = visibleRect(current.target);
      setHole((prev) =>
        prev && next &&
        Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [open, current.target]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!open || !card) return;
    setPos(hole ? cardPosition(hole, { width: card.offsetWidth, height: card.offsetHeight }) : null);
  }, [open, hole, step]);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight" && !last) goTo(step + 1);
      else if (e.key === "ArrowLeft" && step > 0) goTo(step - 1);
      else if (e.key === "Tab") {
        // Keep focus inside the tour card while it's open.
        const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, step, last, goTo, finish]);

  if (!open || !user) return null;

  return createPortal(
    <div className="tour-root">
      {/* Blocks the app underneath; the spotlight is purely visual. */}
      <div className={cn("tour-blocker", !hole && "is-dim")} />
      {hole && (
        <div
          className="tour-spotlight"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <div
        ref={cardRef}
        className={cn("tour-card", !hole && "is-centered", hole && !pos && "is-measuring")}
        style={pos ?? undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        <button className="icon-button tour-close" aria-label="Skip tour" onClick={() => finish()}>
          <X size={15} />
        </button>
        {current.visual === "welcome" && (
          <div className="tour-visual tour-visual-welcome" aria-hidden="true">
            <LogoIcon size={40} />
            <Sparkles size={16} />
          </div>
        )}
        {current.visual === "shots" && (
          <div className="tour-visual tour-visual-shots" aria-hidden="true">
            {[2, 4, 1, 3, 2].map((n, i) => (
              <span key={i} className={cn(i === 1 && "is-picked")} style={{ flexGrow: n }}>
                {i === 1 && <Scissors size={12} />}
              </span>
            ))}
          </div>
        )}
        <p className="tour-progress">
          {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title">{current.title}</h2>
        <p id="tour-body">{current.body}</p>
        {current.target && !hole && (
          <p className="tour-hint">You’ll find this in the ☰ menu.</p>
        )}
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={cn(i === step && "active")} />
          ))}
        </div>
        <div className="tour-actions">
          {step === 0 ? (
            <button className="tour-skip" onClick={() => finish()}>
              Skip tour
            </button>
          ) : (
            <Button variant="outline" className="studio-button" onClick={() => goTo(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          )}
          {last ? (
            <div className="flex gap-2">
              <Button variant="outline" className="studio-button" onClick={() => finish()}>
                Explore first
              </Button>
              <Button ref={primaryRef} className="studio-button" onClick={() => finish("/upload")}>
                Import a video <ArrowRight />
              </Button>
            </div>
          ) : (
            <Button ref={primaryRef} className="studio-button" onClick={() => goTo(step + 1)}>
              {step === 0 ? "Show me around" : "Next"} <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
