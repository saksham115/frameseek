import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listCreations, RENDER_ACTIVE } from "@/api/creations";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/MediaUI";
import CreationsGrid, { isDraft } from "@/components/creator/CreationsGrid";
import TemplateGallery from "@/components/creator/TemplateGallery";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { useTour } from "@/store/tour";

const TABS = [
  { id: "drafts", label: "Drafts" },
  { id: "rendered", label: "Rendered" },
  { id: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const EMPTY: Record<Tab, [string, string]> = {
  drafts: [
    "No drafts right now",
    "Everything you make in the editor saves as a draft as you go, so you can close it and pick it up here later.",
  ],
  rendered: ["Nothing rendered yet", "When a draft is ready, render it from the editor and it lands here, ready to download."],
  all: [
    "Turn your moments into ready-to-post videos",
    "Pick a template for shorts, highlight reels, testimonials and more. Open a video and choose Create, or start here.",
  ],
};

/** Every creation, split into drafts (still being edited) and rendered videos. */
export default function Creations() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as Tab) : "drafts";
  const [gallery, setGallery] = useState(false);
  // "?new=1" (the Creations tour's last step) opens the template gallery.
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setGallery(true);
    params.delete("new");
    setParams(params, { replace: true });
  }, [params, setParams]);
  // First visit to Creations: show its walkthrough once, after the first-visit product tour.
  const user = useAuth((s) => s.user);
  const tourOpen = useTour((s) => s.open);
  const tourAutoStarted = useRef(false);
  useEffect(() => {
    if (!user?.tour_completed_at || user.creations_tour_completed_at || tourOpen) return;
    const t = setTimeout(() => {
      if (tourAutoStarted.current) return;
      tourAutoStarted.current = true;
      useTour.getState().start("creations");
    }, 400);
    return () => clearTimeout(t);
  }, [user?.tour_completed_at, user?.creations_tour_completed_at, tourOpen]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["creations"],
    queryFn: listCreations,
    refetchInterval: (q) =>
      q.state.data?.some((c) => c.latest_render && RENDER_ACTIVE.includes(c.latest_render.status)) ? 4000 : false,
  });
  const all = data ?? [];
  const drafts = all.filter(isDraft);
  const rendered = all.filter((c) => !isDraft(c));
  const shown = tab === "drafts" ? drafts : tab === "rendered" ? rendered : all;
  const counts: Record<Tab, number> = { drafts: drafts.length, rendered: rendered.length, all: all.length };

  return (
    <div className="library-page">
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Creations"
        description="Drafts save as you edit. Come back any time to finish, render and download."
        action={
          <Button className="studio-button" data-tour="new-creation" onClick={() => setGallery(true)}>
            <Plus /> New creation
          </Button>
        }
      />
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="Show creations" data-tour="creation-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={cn(tab === t.id && "active")}
              aria-pressed={tab === t.id}
              onClick={() => setParams(t.id === "drafts" ? {} : { tab: t.id }, { replace: true })}
            >
              {t.label}
              {!isLoading && <span className="tab-count">{counts[t.id]}</span>}
            </button>
          ))}
        </div>
      </div>
      {isError ? (
        <div className="error-state" role="alert">
          We couldn’t load your creations.{" "}
          <button className="underline ml-2" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="media-grid library-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton aspect-[4/3]" />
          ))}
        </div>
      ) : (
        <CreationsGrid
          creations={shown}
          onNew={() => setGallery(true)}
          emptyTitle={all.length ? EMPTY[tab][0] : EMPTY.all[0]}
          emptyText={all.length ? EMPTY[tab][1] : EMPTY.all[1]}
        />
      )}
      <TemplateGallery open={gallery} onOpenChange={setGallery} />
    </div>
  );
}
