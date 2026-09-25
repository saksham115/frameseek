import { useEffect, useState, type ReactNode } from "react";
import { Check, Film, Loader2 } from "lucide-react";
import type { VideoStatus } from "@/api/types";
import { cn } from "@/lib/utils";

const STATUS = {
  completed: "Ready",
  processing: "Processing",
  queued: "Queued",
  uploaded: "Uploaded",
  failed: "Needs attention",
};
export function StatusBadge({ status }: { status: VideoStatus }) {
  return (
    <span className={cn("status-badge", `status-${status}`)}>
      {status === "completed" ? (
        <Check size={11} />
      ) : status === "processing" ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <span className="status-dot" />
      )}
      {STATUS[status]}
    </span>
  );
}
export function MediaThumbnail({
  src,
  alt = "",
  className = "",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  // Signed URLs change on every poll, and a thumbnail may not exist yet while a video
  // processes. Keep the placeholder underneath until an image actually loads so neither
  // case flashes a broken image.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const path = src?.split("?")[0];
  useEffect(() => {
    setFailed(false);
  }, [src]);
  useEffect(() => {
    setLoaded(false);
  }, [path]);
  return (
    <div className={cn("media-thumb", className)}>
      {!loaded && (
        <div className="media-placeholder">
          <Film size={25} strokeWidth={1} />
          <span>FRAMESEEK</span>
        </div>
      )}
      {src && !failed && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cn("media-image", !loaded && "is-loading")}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
        />
      )}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}
