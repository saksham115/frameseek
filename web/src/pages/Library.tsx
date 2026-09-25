import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Film,
  Grid2X2,
  List,
  Plus,
  Play,
  Search,
  Upload,
} from "lucide-react";
import { getLibrary } from "@/api/videos";
import { Button } from "@/components/ui/button";
import { MediaThumbnail, PageHeader, StatusBadge } from "@/components/MediaUI";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "", label: "All videos" },
  { id: "ready", label: "Ready" },
  { id: "processing", label: "Processing" },
  { id: "error", label: "Needs attention" },
];
export default function Library() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["videos", page, filter, sort],
    queryFn: () =>
      getLibrary(
        page,
        sort === "name" ? "title" : "created_at",
        sort === "newest" ? "desc" : "asc",
        filter,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.videos.some((v) =>
        ["processing", "queued", "uploaded"].includes(v.status),
      ) || filter === "processing"
        ? 4000
        : false,
  });
  const videos = data?.videos ?? [];
  const total = data?.pagination.total ?? 0;

  return (
    <div className="library-page">
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Media library"
        description="A home for your footage. A starting point for your next story."
        action={
          <Button asChild className="studio-button">
            <Link to="/upload">
              <Plus /> Import video
            </Link>
          </Button>
        }
      />
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
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="Filter videos">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={cn(filter === f.id && "active")}
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="library-tools">
          <select
            aria-label="Sort videos"
            className="studio-select"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          <div className="view-toggle" aria-label="Library view">
            <button
              className={cn("icon-button", view === "grid" && "active")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={13} />
            </button>
            <button
              className={cn("icon-button", view === "list" && "active")}
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>
      <div className="section-caption">
        <span>
          {filter ? FILTERS.find((f) => f.id === filter)?.label : "All media"}{" "}
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
            <Film size={24} strokeWidth={1.3} />
          </div>
          <h2>
            {filter ? "Nothing here just yet" : "Make room for your next story"}
          </h2>
          <p>
            {filter
              ? "Videos with this status will appear here."
              : "Import a video and turn your footage into a searchable workspace."}
          </p>
          <Button asChild className="studio-button mt-6" variant="outline">
            <Link to={filter ? "/search" : "/upload"}>
              {filter ? <Search /> : <Upload />}
              {filter ? "Search your library" : "Import your first video"}
            </Link>
          </Button>
        </div>
      ) : (
        <div className={view === "grid" ? "media-grid" : "media-list"}>
          {videos.map((v) => (
            <Link className="media-card" to={`/videos/${v.id}`} key={v.id}>
              <div className="media-card-preview">
                <MediaThumbnail
                  src={v.status === "completed" ? v.thumbnail_url : null}
                />
                <div className="preview-shade" />
                <span className="preview-play">
                  <Play size={15} fill="currentColor" />
                </span>
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
          ))}
          {view === "grid" && (
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
            ? `${(page - 1) * 12 + 1}–${Math.min(page * 12, total)} of ${total} videos`
            : "Your library is ready when you are"}
        </span>
        <div className="flex items-center gap-3">
          <span>
            {total
              ? `Page ${page} of ${data?.pagination.total_pages}`
              : "MP4 · MOV · WebM"}
          </span>
          {total > 12 && (
            <>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page === 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={
                  page >= (data?.pagination.total_pages ?? 1) || isFetching
                }
                onClick={() => setPage((p) => p + 1)}
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
