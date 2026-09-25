import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Film, Upload as UploadIcon } from "lucide-react";
import { listVideos } from "@/api/videos";
import type { Video } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/format";

const statusVariant: Record<Video["status"], string> = {
  completed: "border-primary/40 text-primary",
  processing: "border-amber-500/40 text-amber-400 animate-pulse",
  queued: "border-border text-muted-foreground",
  uploaded: "border-border text-muted-foreground",
  failed: "border-destructive/40 text-destructive",
};

const Library = () => {
  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: listVideos,
    // Poll only while something is processing.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((v) => v.status === "processing" || v.status === "queued") ? 4000 : false,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
          <p className="text-muted-foreground mt-1">Every video you’ve made — instantly searchable.</p>
        </div>
        <Button asChild>
          <Link to="/upload">
            <UploadIcon className="h-4 w-4" /> Upload
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : !videos?.length ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <Film className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">No videos yet</p>
          <p className="text-sm text-muted-foreground">Upload your first video to start searching.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((v) => (
            <Link
              key={v.id}
              to={`/videos/${v.id}`}
              className="group rounded-2xl border border-border bg-card overflow-hidden transition-all hover:border-primary hover:-translate-y-0.5"
            >
              <div className="aspect-video bg-secondary relative overflow-hidden">
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt={v.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full grid place-items-center">
                    <Film className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                {v.duration_seconds != null && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
                    {formatTimestamp(v.duration_seconds)}
                  </span>
                )}
              </div>
              <div className="p-4 flex items-center justify-between gap-3">
                <span className="truncate font-medium">{v.title}</span>
                <Badge variant="outline" className={statusVariant[v.status]}>
                  {v.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Library;
