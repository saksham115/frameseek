import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clapperboard, Download, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCreation, downloadRender, listCreations, RENDER_ACTIVE, type Creation } from "@/api/creations";
import { MediaThumbnail } from "@/components/MediaUI";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import TemplateGallery from "@/components/creator/TemplateGallery";
import { apiErrorMessage } from "@/lib/errors";
import { formatClipTime } from "@/lib/clip-time";
import { momentsTotal } from "@/lib/creator";
import "@/creator.css";

/** The Creations tab of the media library: template drafts and their rendered videos. */
export default function CreationsGrid() {
  const qc = useQueryClient();
  const [gallery, setGallery] = useState(false);
  const [deleting, setDeleting] = useState<Creation | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["creations"],
    queryFn: listCreations,
    refetchInterval: (q) =>
      q.state.data?.some((c) => c.latest_render && RENDER_ACTIVE.includes(c.latest_render.status)) ? 4000 : false,
  });
  const remove = useMutation({
    mutationFn: (c: Creation) => deleteCreation(c.creation_id),
    onSuccess: (_, c) => {
      qc.invalidateQueries({ queryKey: ["creations"] });
      setDeleting(null);
      toast.success(`“${c.name}” deleted.`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t delete this creation.")),
  });
  const creations = data ?? [];

  return (
    <>
      <div className="section-caption">
        <span>
          Creations <span className="ml-2 opacity-60">{creations.length.toString().padStart(2, "0")}</span>
        </span>
        <span>Shorts, reels and brand videos made from your moments</span>
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
      ) : !creations.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Clapperboard size={24} strokeWidth={1.3} />
          </div>
          <h2>Turn your moments into ready-to-post videos</h2>
          <p>
            Pick a template for shorts, highlight reels, testimonials and more. Open a video and choose Create, or start
            here and add moments in the editor.
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <Button className="studio-button" onClick={() => setGallery(true)}>
              <Plus /> New creation
            </Button>
          </div>
        </div>
      ) : (
        <div className="media-grid library-grid">
          {creations.map((c) => {
            const r = c.latest_render;
            const rendering = r && RENDER_ACTIVE.includes(r.status);
            return (
              <div key={c.creation_id} className="media-card creation-card">
                <Link className="media-card-link" to={`/create/${c.creation_id}`}>
                  <div className="media-card-preview">
                    <MediaThumbnail src={c.thumbnail_url} />
                    <div className="preview-shade" />
                    <span className="creation-badge">{c.settings.format}</span>
                    {rendering ? (
                      <div className="card-processing" role="status">
                        <Loader2 size={15} className="animate-spin" />
                        <span>{r.status === "queued" ? "Waiting to render" : `Rendering ${r.progress}%`}</span>
                        <div className="card-processing-bar">
                          <span style={{ width: `${r.progress}%` }} />
                        </div>
                      </div>
                    ) : r?.status === "failed" ? (
                      <div className="card-processing is-failed">
                        <AlertTriangle size={15} />
                        <span>Render didn’t finish. Open to retry</span>
                      </div>
                    ) : null}
                    <span className="timecode">{formatClipTime(momentsTotal(c.moments))}</span>
                  </div>
                  <div className="media-card-info">
                    <span className="media-card-title" title={c.name}>
                      {c.name}
                    </span>
                    <div className="media-card-meta">
                      <span>{c.recipe.name}</span>
                      <span>{r?.status === "ready" ? "Rendered" : "Draft"}</span>
                    </div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="icon-button card-menu" aria-label={`Actions for ${c.name}`}>
                      <MoreHorizontal size={15} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {r?.status === "ready" && (
                      <DropdownMenuItem
                        onSelect={() =>
                          downloadRender(r.render_id).catch((e) => toast.error(apiErrorMessage(e, "Download failed.")))
                        }
                      >
                        <Download size={13} /> Download video
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(c)}>
                      <Trash2 size={13} /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          <button type="button" className="import-tile" onClick={() => setGallery(true)}>
            <div className="import-plus">
              <Plus size={20} strokeWidth={1.5} />
            </div>
            <strong>Make something new</strong>
            <span>Start from a template</span>
          </button>
        </div>
      )}
      <TemplateGallery open={gallery} onOpenChange={setGallery} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this creation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” and its rendered videos will be deleted. The videos you made it from stay in your
              library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
