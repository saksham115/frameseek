import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Bug, CheckCircle2, Lightbulb, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import { sendFeedback, type FeedbackCategory } from "@/api/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const MAX = 2000;
const CATEGORIES: { id: FeedbackCategory; label: string; icon: typeof Lightbulb; hint: string }[] = [
  { id: "idea", label: "Idea", icon: Lightbulb, hint: "What would make FrameSeek better for you?" },
  { id: "issue", label: "Issue", icon: Bug, hint: "What went wrong, and what did you expect?" },
  { id: "feature", label: "New feature", icon: Sparkles, hint: "What would you like FrameSeek to do?" },
];

/** One-way feedback to the FrameSeek team, opened from the top bar. */
export default function FeedbackDialog() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  // The draft survives closing the dialog by accident; it clears only once sent.
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      sendFeedback({ category, message: message.trim(), page: location.pathname }),
    onSuccess: () => {
      setSent(true);
      setMessage("");
    },
  });
  const active = CATEGORIES.find((c) => c.id === category)!;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setSent(false);
          send.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <button className="topbar-feedback" data-tour="feedback" aria-label="Send feedback">
          <MessageSquarePlus size={15} />
          <span>Feedback</span>
        </button>
      </DialogTrigger>
      <DialogContent className="feedback-dialog sm:max-w-md">
        {sent ? (
          <div className="feedback-sent" role="status">
            <CheckCircle2 size={30} />
            <DialogTitle>Thanks, it’s on its way.</DialogTitle>
            <DialogDescription>
              Your feedback goes straight to the FrameSeek team. We read every
              message, though we can’t reply from here.
            </DialogDescription>
            <div className="flex gap-2 justify-center mt-2">
              <Button variant="outline" className="studio-button" onClick={() => setSent(false)}>
                Send more
              </Button>
              <Button className="studio-button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (message.trim() && !send.isPending) send.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>
                Straight to the FrameSeek team. We read everything, but can’t
                reply here.
              </DialogDescription>
            </DialogHeader>
            <div className="feedback-categories" role="radiogroup" aria-label="Feedback type">
              {CATEGORIES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={category === id}
                  className={cn(category === id && "active")}
                  onClick={() => setCategory(id)}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              className="studio-input feedback-message"
              aria-label="Your feedback"
              placeholder={active.hint}
              maxLength={MAX}
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="feedback-meta">
              <span>We’ll include the page you’re on ({location.pathname}).</span>
              <span className={cn(message.length > MAX - 100 && "text-destructive")}>
                {message.length}/{MAX}
              </span>
            </div>
            {send.isError && (
              <p className="text-destructive text-xs mt-3" role="alert">
                {apiErrorMessage(send.error, "Couldn’t send your feedback.")} Your
                message is still here.
              </p>
            )}
            <div className="flex justify-end mt-5">
              <Button
                type="submit"
                className="studio-button"
                disabled={!message.trim() || send.isPending}
              >
                <Send /> {send.isPending ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
