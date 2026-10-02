import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Clapperboard, Download, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCreation, downloadRender, RENDER_ACTIVE, type Creation } from "@/api/creations";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiErrorMessage } from "@/lib/errors";
import { formatClipTime } from "@/lib/clip-time";
import { momentsTotal } from "@/lib/creator";
import "@/creator.css";

/** A creation is a draft until it has a finished render. */
export function isDraft(c: Creation) {
  return c.latest_render?.status !== "ready";
}

/** A grid of creations: drafts to continue and rendered videos to download. */
export default function CreationsGrid({
  creations,
  onNew,
  emptyTitle,
  emptyText,
}: {
  creations: Creation[];
  onNew: () => void;
  emptyTitle: string;
  emptyText: string;
}) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<Creation | null>(null);
  const remove = useMutation({
    mutationFn: (c: Creation) => deleteCreation(c.creation_id),
    onSuccess: (_, c) => {
      qc.invalidateQueries({ queryKey: ["creations"] });
      setDeleting(null);
      toast.success(`“${c.name}” deleted.`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t delete this creation.")),
  });

  return (
    <>
      {!creations.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Clapperboard size={24} strokeWidth={1.3} />
          </div>
          <h2>{emptyTitle}</h2>
          <p>{emptyText}</p>
          <div className="flex justify-center gap-2 mt-6">
            <Button className="studio-button" onClick={onNew}>
              <Plus /> New creation
            </Button>
          </div>
        </div>
      ) : (
        <div className="media-grid library-grid">
          {creations.map((c) => {
            const r = c.latest_render;
            const rendering = r && RENDER_ACTIVE.includes(r.status);
            const draft = isDraft(c);
            return (
              <div key={c.creation_id} className="media-card creation-card">
                <Link className="media-card-link" to={`/create/${c.creation_id}`}>
                  <div className="media-card-preview">
                    <MediaThumbnail src={c.thumbnail_url} />
                    <div className="preview-shade" />
                    <span className="creation-badge">{c.settings.format}</span>
                    {draft && !rendering && <span className="creation-draft">Draft</span>}
                    {!draft && <span className="creation-draft is-ready">Ready</span>}
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
                    ) : draft ? (
                      <span className="creation-continue">
                        <Pencil size={13} /> Continue editing
                      </span>
                    ) : null}
                    <span className="timecode">{formatClipTime(momentsTotal(c.moments))}</span>
                  </div>
                  <div className="media-card-info">
                    <span className="media-card-title" title={c.name}>
                      {c.name}
                    </span>
                    <div className="media-card-meta">
                      <span>{c.recipe.name}</span>
                      <span title={new Date(c.updated_at).toLocaleString()}>
                        {draft ? "Edited " : "Rendered "}
                        {formatDistanceToNow(new Date(draft ? c.updated_at : (r?.completed_at ?? c.updated_at)), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="icon-button card-menu" aria-label={`Actions for ${c.name}`}>
                      <MoreHorizontal size={15} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="studio-menu">
                    <DropdownMenuItem asChild>
                      <Link to={`/create/${c.creation_id}`}>
                        <Pencil /> {isDraft(c) ? "Continue editing" : "Edit"}
                      </Link>
                    </DropdownMenuItem>
                    {r?.status === "ready" && (
                      <DropdownMenuItem
                        onSelect={() =>
                          downloadRender(r.render_id).catch((e) => toast.error(apiErrorMessage(e, "Download failed.")))
                        }
                      >
                        <Download /> Download video
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(c)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          <button type="button" className="import-tile" onClick={onNew}>
            <div className="import-plus">
              <Plus size={20} strokeWidth={1.5} />
            </div>
            <strong>Make something new</strong>
            <span>Start from a template</span>
          </button>
        </div>
      )}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleting && isDraft(deleting) ? "draft" : "creation"}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.name}” and any rendered videos from it will be deleted. The videos you made it from stay in
              your library.
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
