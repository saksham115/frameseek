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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn("media-image", className)}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={cn("media-placeholder", className)}>
      <Film size={25} strokeWidth={1} />
      <span>FRAMESEEK</span>
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
