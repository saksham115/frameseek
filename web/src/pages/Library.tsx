import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Film,
  Folder as FolderIcon,
  FolderPlus,
  Grid2X2,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Play,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getLibrary, LIBRARY_PAGE_SIZE } from "@/api/videos";
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  type Folder,
} from "@/api/folders";
import { getPaymentConfig } from "@/api/subscriptions";
import type { Video } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MediaThumbnail, PageHeader, StatusBadge } from "@/components/MediaUI";
import VideoActionsMenu from "@/components/VideoActions";
import { apiErrorMessage } from "@/lib/errors";
import { formatBytes, formatTimestamp } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "", label: "All videos" },
  { id: "ready", label: "Ready" },
  { id: "processing", label: "Processing" },
  { id: "error", label: "Needs attention" },
];
const SORTS = ["newest", "oldest", "name"];
const VIEW_KEY = "frameseek:library-view";
const IN_FLIGHT = ["processing", "queued", "uploaded"];

function storedView(): "grid" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.id === params.get("status"))
    ? (params.get("status") ?? "")
    : "";
  const sort = SORTS.includes(params.get("sort") ?? "")
    ? params.get("sort")!
    : "newest";
  const view =
    params.get("view") === "list" || params.get("view") === "grid"
      ? (params.get("view") as "grid" | "list")
      : storedView();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const folderId = params.get("folder") ?? "";
  const q = params.get("q") ?? "";
  const [titleQuery, setTitleQuery] = useState(q);

  /** Merge changes into the URL; any change other than paging returns to page 1. */
  const update = (changes: Record<string, string>, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace },
    );

  useEffect(() => setTitleQuery(q), [q]);
  useEffect(() => {
    if (titleQuery.trim() === q) return;
    const t = setTimeout(() => update({ q: titleQuery.trim() }, true), 300);
    return () => clearTimeout(t);
  }, [titleQuery]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["videos", page, filter, sort, folderId, q],
    queryFn: () =>
      getLibrary({
        page,
        sort: sort === "name" ? "title" : "created_at",
        order: sort === "newest" ? "desc" : "asc",
        status: filter,
        folderId,
        q,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.videos.some((v) => IN_FLIGHT.includes(v.status)) ||
      filter === "processing"
        ? 4000
        : false,
  });
  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: listFolders,
  });
  const activeFolder = folders?.find((f) => f.id === folderId);
  const videos = data?.videos ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.total_pages ?? 1;

  // A page can empty out after deletes; step back rather than showing nothing.
  useEffect(() => {
    if (data && page > 1 && page > totalPages)
      update({ page: String(Math.max(1, totalPages)) }, true);
  }, [data, page, totalPages]);

  const narrowed = !!(filter || q || folderId);
  return (
    <div className="library-page">
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Media library"
        description="A home for your footage. A starting point for your next story."
        action={
          <Button asChild className="studio-button">
            <Link to={folderId ? `/upload?folder=${folderId}` : "/upload"}>
              <Plus /> Import video
            </Link>
          </Button>
        }
      />
      <StorageBanner />
      <FolderBar
        folders={folders ?? []}
        activeId={folderId}
        onSelect={(id) => update({ folder: id })}
      />
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="Filter videos">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={cn(filter === f.id && "active")}
              aria-pressed={filter === f.id}
              onClick={() => update({ status: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="library-tools">
          <label className="library-find">
            <Search size={13} />
            <input
              type="search"
              aria-label="Filter videos by title"
              placeholder="Filter by title"
              value={titleQuery}
              maxLength={200}
              onChange={(e) => setTitleQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Sort videos"
            className="studio-select"
            value={sort}
            onChange={(e) =>
              update({ sort: e.target.value === "newest" ? "" : e.target.value })
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          <div className="view-toggle" aria-label="Library view">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                className={cn("icon-button", view === v && "active")}
                aria-label={v === "grid" ? "Grid view" : "List view"}
                aria-pressed={view === v}
                onClick={() => {
                  try {
                    localStorage.setItem(VIEW_KEY, v);
                  } catch {
                    /* storage unavailable: the URL still carries the view */
                  }
                  update({ view: v, page: String(page) }, true);
                }}
              >
                {v === "grid" ? <Grid2X2 size={13} /> : <List size={15} />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="section-caption">
        <span>
          {activeFolder?.name ??
            (filter ? FILTERS.find((f) => f.id === filter)?.label : "All media")}
          {q && <> · “{q}”</>}
          <span className="ml-2 opacity-60">
            {total.toString().padStart(2, "0")}
          </span>
        </span>
        <span>
          {isFetching && !isLoading ? "Updating…" : "Your footage, in focus"}
        </span>
      </div>
      {isError ? (
        <div className="error-state" role="alert">
          We couldn’t load your library.{" "}
          <button className="underline ml-2" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="media-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton aspect-[4/3]" />
          ))}
        </div>
      ) : !videos.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            {folderId ? (
              <FolderIcon size={24} strokeWidth={1.3} />
            ) : (
              <Film size={24} strokeWidth={1.3} />
            )}
          </div>
          <h2>
            {q
              ? "No titles match that filter"
              : folderId && !filter
                ? "This folder is empty"
                : narrowed
                  ? "Nothing here just yet"
                  : "Make room for your next story"}
          </h2>
          <p>
            {q
              ? "Try a shorter word, or clear the filter. To search what’s inside your videos, use visual search."
              : folderId && !filter
                ? "Import straight into this folder, or move videos here from their ⋯ menu."
                : narrowed
                  ? "Videos with this status will appear here."
                  : "Import a video and turn your content into a searchable workspace."}
          </p>
          <div className="flex justify-center gap-2 mt-6">
            {narrowed && (
              <Button
                className="studio-button"
                variant="outline"
                onClick={() => update({ status: "", q: "", folder: "" })}
              >
                <X /> Clear filters
              </Button>
            )}
            {q ? (
              <Button asChild className="studio-button" variant="outline">
                <Link to={`/search?q=${encodeURIComponent(q)}`}>
                  <Search /> Search inside videos
                </Link>
              </Button>
            ) : (
              <Button asChild className="studio-button" variant="outline">
                <Link to={folderId ? `/upload?folder=${folderId}` : "/upload"}>
                  <Upload /> Import a video
                </Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className={view === "grid" ? "media-grid" : "media-list"}>
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
          {view === "grid" && !narrowed && (
            <Link to="/upload" className="import-tile">
              <div className="import-plus">
                <Plus size={20} strokeWidth={1.5} />
              </div>
              <strong>Bring in something new</strong>
              <span>Import a video to your library</span>
            </Link>
          )}
        </div>
      )}
      <div className="library-footer">
        <span>
          {total
            ? `${(page - 1) * LIBRARY_PAGE_SIZE + 1}–${Math.min(page * LIBRARY_PAGE_SIZE, total)} of ${total} videos`
            : "Your library is ready when you are"}
        </span>
        <div className="flex items-center gap-3">
          <span>
            {total ? `Page ${page} of ${totalPages}` : "MP4 · MOV · WebM"}
          </span>
          {total > LIBRARY_PAGE_SIZE && (
            <>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page === 1 || isFetching}
                onClick={() => update({ page: String(page - 1) })}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={page >= totalPages || isFetching}
                onClick={() => update({ page: String(page + 1) })}
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video: v }: { video: Video }) {
  const inFlight = IN_FLIGHT.includes(v.status);
  return (
    <div className="media-card">
      <Link className="media-card-link" to={`/videos/${v.id}`}>
        <div className="media-card-preview">
          {/* The first frame is often ready before processing finishes; fall back quietly if not. */}
          <MediaThumbnail src={v.thumbnail_url} />
          <div className="preview-shade" />
          {inFlight ? (
            <div className="card-processing" role="status">
              <Loader2 size={15} className="animate-spin" />
              <span>
                {v.status === "processing"
                  ? `Processing ${v.progress ?? 0}%`
                  : v.status === "queued"
                    ? "Queued for processing"
                    : "Waiting for upload"}
              </span>
              {v.status === "processing" && (
                <div className="card-processing-bar">
                  <span style={{ width: `${v.progress ?? 0}%` }} />
                </div>
              )}
            </div>
          ) : v.status === "failed" ? (
            <div className="card-processing is-failed">
              <AlertTriangle size={15} />
              <span>Processing failed. Retry from the ⋯ menu</span>
            </div>
          ) : (
            <span className="preview-play">
              <Play size={15} fill="currentColor" />
            </span>
          )}
          {v.duration_seconds != null && (
            <span className="timecode">
              {formatTimestamp(v.duration_seconds)}
            </span>
          )}
        </div>
        <div className="media-card-info">
          <span className="media-card-title" title={v.title}>
            {v.title}
          </span>
          <div className="media-card-meta">
            <span>
              {new Date(v.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <StatusBadge status={v.status} />
          </div>
        </div>
      </Link>
      <VideoActionsMenu video={v} className="card-menu" />
    </div>
  );
}

function StorageBanner() {
  const user = useAuth((s) => s.user);
  const { data: paymentConfig } = useQuery({
    queryKey: ["payment-config"],
    queryFn: getPaymentConfig,
    staleTime: 5 * 60_000,
  });
  const used = user?.storage_used_bytes ?? 0;
  const limit = user?.storage_limit_bytes ?? 0;
  const pct = limit ? (used / limit) * 100 : 0;

  if (pct < 85) {
    return (
      <div className="library-banner">
        <div className="banner-art" aria-hidden="true">
          <span />
          <span />
          <Search size={16} />
        </div>
        <div>
          <h2>Your next great moment is already in here.</h2>
          <p>Find it with a few words. Search scenes, objects, and actions.</p>
        </div>
        <Link to="/search">
          Explore visual search <ArrowRight size={14} />
        </Link>
      </div>
    );
  }
  const full = pct >= 99;
  return (
    <div className={cn("library-banner storage-warning", full && "is-full")} role="status">
      <div className="storage-warning-icon" aria-hidden="true">
        <AlertTriangle size={18} />
      </div>
      <div>
        <h2>
          {full
            ? "Your storage is full."
            : `You’ve used ${Math.round(pct)}% of your storage.`}
        </h2>
        <p>
          {formatBytes(Math.max(0, limit - used))} left of {formatBytes(limit)}.{" "}
          {full ? "New uploads are paused until you free up space. " : ""}
          Delete videos you no longer need from their ⋯ menu
          {paymentConfig?.payments_enabled ? ", or upgrade for more room." : "."}
        </p>
      </div>
      {paymentConfig?.payments_enabled ? (
        <Link to="/upgrade">
          See plans <ArrowRight size={14} />
        </Link>
      ) : (
        <Link to="/settings">
          Storage details <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

function FolderBar({
  folders,
  activeId,
  onSelect,
}: {
  folders: Folder[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "rename"; folder: Folder } | null
  >(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["videos"] });
  };
  const save = useMutation({
    mutationFn: () =>
      dialog?.mode === "rename"
        ? renameFolder(dialog.folder.id, name.trim())
        : createFolder(name.trim()),
    onSuccess: (folder) => {
      refresh();
      if (dialog?.mode === "create") onSelect(folder.id);
      setDialog(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t save the folder.")),
  });
  const remove = useMutation({
    mutationFn: (f: Folder) => deleteFolder(f.id),
    onSuccess: (_, f) => {
      if (activeId === f.id) onSelect("");
      refresh();
      setDeleting(null);
      toast.success(`Folder “${f.name}” deleted. Its videos are still in your library.`);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t delete the folder.")),
  });
  const open = (d: NonNullable<typeof dialog>) => {
    setName(d.mode === "rename" ? d.folder.name : "");
    setDialog(d);
  };

  return (
    <>
      <div className="folder-bar" aria-label="Folders">
        <button
          className={cn("folder-chip", !activeId && "active")}
          aria-pressed={!activeId}
          onClick={() => onSelect("")}
        >
          <Film size={13} /> Everything
        </button>
        {folders.map((f) => (
          <div
            key={f.id}
            className={cn("folder-chip has-menu", activeId === f.id && "active")}
          >
            <button aria-pressed={activeId === f.id} onClick={() => onSelect(f.id)}>
              <FolderIcon size={13} />
              <span className="truncate">{f.name}</span>
              <span className="folder-count">{f.video_count}</span>
            </button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  className="folder-chip-menu"
                  aria-label={`Actions for folder ${f.name}`}
                >
                  <MoreHorizontal size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="studio-menu">
                <DropdownMenuItem onSelect={() => open({ mode: "rename", folder: f })}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleting(f)}
                >
                  <Trash2 /> Delete folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        <button className="folder-chip is-new" onClick={() => open({ mode: "create" })}>
          <FolderPlus size={13} /> New folder
        </button>
      </div>
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && !save.isPending) save.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {dialog?.mode === "rename" ? "Rename folder" : "New folder"}
              </DialogTitle>
              <DialogDescription>
                {dialog?.mode === "rename"
                  ? "Videos in this folder stay where they are."
                  : "Group related footage so it’s easy to come back to."}
              </DialogDescription>
            </DialogHeader>
            <input
              autoFocus
              className="studio-input my-5"
              aria-label="Folder name"
              placeholder="e.g. Client shoots"
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="studio-button"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="studio-button"
                disabled={!name.trim() || save.isPending}
              >
                {dialog?.mode === "rename" ? "Save" : "Create folder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder is removed, but its {deleting?.video_count ?? 0}{" "}
              {deleting?.video_count === 1 ? "video stays" : "videos stay"} in your
              library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep folder</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
