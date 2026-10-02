import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  createCreation,
  getTemplates,
  type CreationFormat,
  type TemplateRecipe,
} from "@/api/creations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { anchorFor, formatAspect, FORMAT_LABELS, newMomentId, videoBox } from "@/lib/creator";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import "@/creator.css";

export interface StartMoment {
  video_id: string;
  start: number;
  end: number;
}

const GOALS = [
  { id: "", label: "All templates" },
  { id: "short", label: "Shorts" },
  { id: "reel", label: "Reels & highlights" },
  { id: "brand", label: "Brand" },
] as const;

/** A schematic of a template's layout: where footage, text and captions sit. */
export function TemplateArt({ recipe, format }: { recipe: TemplateRecipe; format?: CreationFormat }) {
  const fmt = format ?? recipe.default_format;
  const box = videoBox(recipe.layout, fmt);
  const aspect = formatAspect(fmt);
  const layers = recipe.text_layers.filter((l) => !l.timing.from || l.timing.from === "start" || l.timing.per_moment);
  return (
    <div className="template-art" style={{ aspectRatio: String(aspect) }} aria-hidden="true">
      {recipe.layout.type !== "fill" && <div className="template-art-bg" />}
      <div
        className={cn("template-art-footage", recipe.layout.type === "frame" && "is-inset")}
        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
      />
      {layers.slice(0, 3).map((l) => {
        const a = anchorFor(l.style.position ?? "top", recipe.layout.type, box);
        return (
          <span
            key={l.id}
            className={cn("template-art-text", l.style.box && "is-boxed")}
            style={{
              left: a.align === "left" ? `${a.x * 100}%` : undefined,
              right: a.align === "right" ? `${(1 - a.x) * 100}%` : undefined,
              top: `${a.y * 100}%`,
              transform: `translate(${a.align === "center" ? "-50%" : "0"}, ${a.valign === "middle" ? "-50%" : a.valign === "bottom" ? "-100%" : "0"})`,
              ...(a.align === "center" ? { left: "50%" } : {}),
              width: l.style.size === "xl" || l.style.size === "xxl" ? "56%" : "38%",
            }}
          />
        );
      })}
      {recipe.captions.enabled && (() => {
        const a = anchorFor(recipe.captions.position, recipe.layout.type, box);
        return (
          <span
            className="template-art-caption"
            style={{ top: `${a.y * 100}%`, transform: `translate(-50%, ${a.valign === "middle" ? "-50%" : "-100%"})` }}
          />
        );
      })()}
    </div>
  );
}

export default function TemplateGallery({
  open,
  onOpenChange,
  moments = [],
  sourceTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moments?: StartMoment[];
  sourceTitle?: string;
}) {
  const navigate = useNavigate();
  const [goal, setGoal] = useState<string>("");
  const [format, setFormat] = useState<CreationFormat | "">("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["templates"],
    queryFn: getTemplates,
    staleTime: 10 * 60_000,
    enabled: open,
  });
  const templates = useMemo(
    () =>
      (data?.templates ?? []).filter(
        (t) => (!goal || t.category === goal) && (!format || t.formats.includes(format)),
      ),
    [data, goal, format],
  );

  const create = useMutation({
    mutationFn: (t: TemplateRecipe) => {
      const maxLen = t.moments.max_moment_seconds;
      const picked = moments.slice(0, t.moments.max).map((m) => ({
        id: newMomentId(),
        video_id: m.video_id,
        start: m.start,
        end: maxLen ? Math.min(m.end, m.start + maxLen) : m.end,
        keep_audio: true,
      }));
      return createCreation({
        template_id: t.id,
        format: format && t.formats.includes(format) ? format : undefined,
        moments: picked,
      });
    },
    onSuccess: (creation) => {
      onOpenChange(false);
      navigate(`/create/${creation.creation_id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t start this creation.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="template-gallery">
        <DialogHeader>
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            {moments.length
              ? `Starting with ${moments.length === 1 ? "your selection" : `${moments.length} moments`}${sourceTitle ? ` from “${sourceTitle}”` : ""}. You can add, trim and reorder moments next.`
              : "Pick a starting point. You’ll add moments from your videos in the editor."}
          </DialogDescription>
        </DialogHeader>
        <div className="gallery-filters">
          <div className="filter-tabs" aria-label="Template goal">
            {GOALS.map((g) => (
              <button key={g.id} className={cn(goal === g.id && "active")} aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          <select
            className="studio-select"
            aria-label="Filter by format"
            value={format}
            onChange={(e) => setFormat(e.target.value as CreationFormat | "")}
          >
            <option value="">Any format</option>
            {(Object.keys(FORMAT_LABELS) as CreationFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        {isError ? (
          <div className="error-state" role="alert">
            We couldn’t load the templates.{" "}
            <button className="underline ml-2" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="template-grid">
            {isLoading
              ? [0, 1, 2, 3].map((i) => <div key={i} className="skeleton template-card-skeleton" />)
              : templates.map((t) => {
                  const busy = create.isPending && create.variables?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      className="template-card"
                      onClick={() => create.mutate(t)}
                      disabled={create.isPending}
                      aria-label={`Use the ${t.name} template`}
                    >
                      <div className="template-card-art">
                        <TemplateArt recipe={t} format={format && t.formats.includes(format) ? format : undefined} />
                        {busy && (
                          <span className="template-card-busy">
                            <Loader2 className="animate-spin" size={16} /> Setting up…
                          </span>
                        )}
                      </div>
                      <div className="template-card-info">
                        <strong>{t.name}</strong>
                        <p>{t.description}</p>
                        <div className="template-card-meta">
                          <span>{t.formats.join(" · ")}</span>
                          <span>
                            {t.moments.min === t.moments.max
                              ? `${t.moments.max} moment${t.moments.max === 1 ? "" : "s"}`
                              : `${t.moments.min}–${t.moments.max} moments`}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
            {!isLoading && !templates.length && (
              <p className="template-empty">
                <Sparkles size={14} /> No templates match. Try another format or goal.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
