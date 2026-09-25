import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { getVideo } from "@/api/videos";
import { search } from "@/api/search";
import type { SearchMatch } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/format";

const VideoDetail = () => {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const { data: video } = useQuery({
    queryKey: ["video", id],
    queryFn: () => getVideo(id),
    refetchInterval: (q) =>
      q.state.data?.status === "processing" || q.state.data?.status === "queued" ? 4000 : false,
  });

  // Seek to the timestamp passed from a search result (?t=seconds).
  const seekTo = (seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = seconds;
    el.play().catch(() => undefined);
  };

  useEffect(() => {
    const t = Number(params.get("t"));
    if (video && !Number.isNaN(t) && t > 0) seekTo(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, params]);

  const runScopedSearch = async () => {
    if (!query.trim() || isSearching) return;
    setSearchError(false);
    setIsSearching(true);
    setMatches(null);
    try {
      setMatches(await search(query.trim(), id));
    } catch {
      setSearchError(true);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold tracking-tight truncate">{video?.title ?? "Loading…"}</h1>
        {video && <Badge variant="outline">{video.status}</Badge>}
      </div>

      <div className="rounded-2xl overflow-hidden border border-border bg-black aspect-video">
        {video?.video_url ? (
          <video ref={videoRef} controls className="h-full w-full" poster={video.thumbnail_url ?? undefined}>
            <source src={video.video_url} />
          </video>
        ) : (
          <div className="h-full grid place-items-center text-muted-foreground font-mono text-sm">
            {video?.status === "failed" ? "Processing failed" : "Processing… frames and transcript are being generated"}
          </div>
        )}
      </div>

      {video?.status === "failed" && (
        <p role="status" className="mt-3 text-sm text-destructive">Your video was uploaded, but processing failed. Search results are not available for it yet.</p>
      )}
      {(video?.status === "processing" || video?.status === "queued") && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">Processing your video. You can watch it while we prepare search results.</p>
      )}

      <div className="search-bar mt-6">
        <SearchIcon className="h-5 w-5 shrink-0" style={{ color: "var(--cream-mid)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runScopedSearch()}
          placeholder="Search within this video…"
        />
        <button className="search-btn" onClick={runScopedSearch} disabled={isSearching}>{isSearching ? "Searching…" : "Search"}</button>
      </div>

      {searchError && <p role="alert" className="mt-4 text-destructive">Search is temporarily unavailable. Please try again later.</p>}

      {matches && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {matches.map((m, i) => (
            <button
              key={i}
              onClick={() => seekTo(m.timestamp_seconds)}
              className="group rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
            >
              <div className="aspect-video relative">
                <img src={m.frame_url} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[10px] text-white">
                  {formatTimestamp(m.timestamp_seconds)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoDetail;
