import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clapperboard, Scissors, Sparkles, X } from "lucide-react";
import { completeCreationsTour, completeTour } from "@/api/auth";
import type { User } from "@/api/types";
import { Button } from "@/components/ui/button";
import LogoIcon from "@/components/LogoIcon";
import { useAuth } from "@/store/auth";
import { useTour, type TourId } from "@/store/tour";
import { useImportDialog } from "@/store/importDialog";
import { cn } from "@/lib/utils";

interface Step {
  /** `data-tour` value of the element to spotlight; omitted for centred steps. */
  target?: string;
  title: string;
  body: string;
  visual?: "welcome" | "shots" | "creations" | "editor";
  /** Shown when the target isn't on screen (e.g. the sidebar on phones). */
  hiddenHint?: string;
}

const MENU_HINT = "You’ll find this in the ☰ menu.";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const MAIN_STEPS: Step[] = [
  {
    title: "Welcome to FrameSeek",
    body: "Here’s a tour of the essentials. You can skip it, and replay it later from Settings.",
    visual: "welcome",
  },
  {
    target: "nav-library",
    hiddenHint: MENU_HINT,
    title: "Your media library",
    body: "Everything you import lives here.",
  },
  {
    target: "import",
    hiddenHint: "You’ll find the Import video button at the top of your Media library.",
    title: "Bring your content in",
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
    hiddenHint: MENU_HINT,
    title: "Keep an eye on space",
    body: "Your plan’s storage and how much you’ve used. We’ll alert you before it fills up.",
  },
  {
    target: "feedback",
    title: "Tell us what you think",
    body: "Ideas, issues and new features: send them here. They go straight to the FrameSeek team.",
  },
  {
    title: "You’re all set",
    body: "Start by importing a video. Once it’s processed, everything in it is searchable.",
  },
];

const CREATIONS_STEPS: Step[] = [
  {
    title: "Welcome to Creations",
    body: "Turn moments from your videos into ready-to-post shorts, highlight reels and more. Creations is in beta, so expect it to keep improving.",
    visual: "creations",
  },
  {
    target: "new-creation",
    title: "Start from a template",
    body: "Pick a template for shorts, reels or brand videos. You can also open any video in your library and choose Create to start from the moment you’re on.",
  },
  {
    title: "Shape it in the editor",
    body: "Add, trim and reorder your moments, then set the format, captions, and intro and end cards. The preview updates as you go.",
    visual: "editor",
  },
  {
    target: "creation-tabs",
    title: "Drafts save as you go",
    body: "Everything you make saves as a draft automatically. When one is ready, render it and it moves to Rendered, ready to download.",
  },
  {
    target: "feedback",
    title: "Help shape Creations",
    body: "It’s in beta, so your feedback counts. Tell us what works, what doesn’t and what you’d like next.",
  },
];

interface TourDef {
  steps: Step[];
  isDone: (user: User) => boolean;
  /** Recorded server-side so the tour doesn't reappear on other devices. */
  complete: () => Promise<User>;
  /** Primary button on the last step. */
  cta: { label: string; run: (finish: (then?: string) => void) => void };
}

const TOURS: Record<TourId, TourDef> = {
  main: {
    steps: MAIN_STEPS,
    isDone: (u) => !!u.tour_completed_at,
    complete: completeTour,
    cta: {
      label: "Import a video",
      run: (finish) => {
        finish("/");
        useImportDialog.getState().show();
      },
    },
  },
  creations: {
    steps: CREATIONS_STEPS,
    isDone: (u) => !!u.creations_tour_completed_at,
    complete: completeCreationsTour,
    cta: { label: "Choose a template", run: (finish) => finish("/creations?new=1") },
  },
};

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
  const { open, tour, step, goTo, close } = useTour();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [hole, setHole] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const def = TOURS[tour];
  const steps = def.steps;
  const current = steps[step];
  const last = step === steps.length - 1;

  const finish = useCallback(
    (then?: string) => {
      close();
      if (then) navigate(then);
      const me = useAuth.getState().user;
      if (me && !def.isDone(me)) def.complete().then(setUser).catch(() => undefined);
    },
    [close, navigate, setUser, def],
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

  if (!open || !user || !current) return null;

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
        {current.visual === "creations" && (
          <div className="tour-visual tour-visual-welcome" aria-hidden="true">
            <Clapperboard size={30} strokeWidth={1.6} />
            <span className="nav-beta">Beta</span>
          </div>
        )}
        {current.visual === "editor" && (
          <div className="tour-visual tour-visual-editor" aria-hidden="true">
            <span className="tour-editor-preview">
              <span />
            </span>
            <span className="tour-editor-panel">
              <span />
              <span />
              <span />
            </span>
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
          {step + 1} of {steps.length}
        </p>
        <h2 id="tour-title">{current.title}</h2>
        <p id="tour-body">{current.body}</p>
        {current.hiddenHint && !hole && <p className="tour-hint">{current.hiddenHint}</p>}
        <div className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
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
              <Button ref={primaryRef} className="studio-button" onClick={() => def.cta.run(finish)}>
                {def.cta.label} <ArrowRight />
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
