import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  FileVideo,
  LockKeyhole,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { listFolders } from "@/api/folders";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/MediaUI";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/store/auth";
import {
  isActiveUpload,
  pendingUploadBytes,
  useUploads,
  type UploadItem,
} from "@/store/uploads";
import { cn } from "@/lib/utils";

const MAX_BYTES = 500 * 1024 * 1024;

const STATUS_LABEL: Record<UploadItem["status"], string> = {
  queued: "Waiting to upload",
  uploading: "Uploading",
  finalizing: "Preparing your video…",
  done: "Uploaded. Processing has started",
  failed: "Upload failed",
  cancelled: "Cancelled",
};

export default function Upload() {
  const [params] = useSearchParams();
  const [folderId, setFolderId] = useState(params.get("folder") ?? "");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuth((s) => s.user);
  const { items, enqueue, cancel, retry, dismiss, clearFinished } = useUploads();
  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: listFolders,
  });
  const active = items.filter(isActiveUpload);
  const remainingBytes = Math.max(
    0,
    (user?.storage_limit_bytes ?? 0) -
      (user?.storage_used_bytes ?? 0) -
      pendingUploadBytes(items),
  );

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    let budget = remainingBytes;
    const accepted: File[] = [];
    for (const f of files) {
      if (!/\.(mp4|mov|webm)$/i.test(f.name)) {
        toast.error(`“${f.name}” isn’t an MP4, MOV, or WebM video.`);
      } else if (f.size === 0) {
        toast.error(`“${f.name}” is empty.`);
      } else if (f.size > MAX_BYTES) {
        toast.error(
          `“${f.name}” is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_BYTES)} per video.`,
        );
      } else if (user?.storage_limit_bytes && f.size > budget) {
        toast.error(
          `Not enough space for “${f.name}” (${formatBytes(f.size)}). You have ${formatBytes(budget)} left.`,
          {
            description: "Delete videos you no longer need to free up space.",
          },
        );
      } else {
        budget -= f.size;
        accepted.push(f);
      }
    }
    if (accepted.length) enqueue(accepted, folderId || null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <PageHeader
        eyebrow="START SOMETHING GOOD"
        title="Bring your content in."
        description="Add one video or a whole batch. Uploads keep going while you work elsewhere in FrameSeek."
      />
      <div className="upload-layout">
        <div>
          <div className="upload-options">
            <label htmlFor="upload-folder">Save to</label>
            <select
              id="upload-folder"
              className="studio-select"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">Library (no folder)</option>
              {folders?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="upload-space">
              {formatBytes(remainingBytes)} of space left
            </span>
          </div>
          <button
            type="button"
            className={cn("upload-dropzone", dragging && "dragging")}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
          >
            <div className="empty-icon">
              <UploadCloud size={27} strokeWidth={1.4} />
            </div>
            <h2>Drop your videos here</h2>
            <p>
              or <span className="text-primary">browse files</span> from your
              computer
            </p>
            <div className="file-formats">
              <span>MP4</span>
              <span>MOV</span>
              <span>WEBM</span>
              <span>UP TO 500 MB EACH</span>
            </div>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            hidden
            onChange={(e) => pick(e.target.files)}
          />
          {items.length > 0 && (
            <div className="upload-queue" aria-live="polite">
              <div className="section-caption mt-6">
                <span>
                  {active.length
                    ? `Uploading ${active.length} of ${items.length}`
                    : "Uploads finished"}
                </span>
                {items.length > active.length && (
                  <button className="underline" onClick={clearFinished}>
                    Clear finished
                  </button>
                )}
              </div>
              {items.map((item) => (
                <UploadRow
                  key={item.id}
                  item={item}
                  onCancel={() => cancel(item.id)}
                  onRetry={() => retry(item.id)}
                  onDismiss={() => dismiss(item.id)}
                />
              ))}
              {active.length > 0 && (
                <p className="upload-keep-open">
                  Keep this tab open until uploads finish. You can keep using
                  FrameSeek in the meantime.
                </p>
              )}
            </div>
          )}
        </div>
        <aside className="upload-aside">
          <h2>A little work behind the scenes.</h2>
          {[
            {
              title: "Make yourself at home",
              text: "Your original video is stored in your personal library.",
            },
            {
              title: "Let us find the details",
              text: "We index the visuals and transcribe any spoken audio.",
            },
            {
              title: "Get to the good part",
              text: "Search your footage and jump to any matching moment.",
            },
          ].map((s, i) => (
            <div className="upload-step" key={s.title}>
              <span>{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
          <div className="upload-privacy">
            <LockKeyhole size={13} />
            <span>Your library is private to your account.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function UploadRow({
  item,
  onCancel,
  onRetry,
  onDismiss,
}: {
  item: UploadItem;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const active = isActiveUpload(item);
  return (
    <div
      className={cn(
        "upload-selection",
        item.status === "failed" && "is-failed",
        item.status === "done" && "is-done",
      )}
    >
      {item.status === "done" ? (
        <Check size={22} className="text-primary shrink-0" />
      ) : (
        <FileVideo
          size={22}
          strokeWidth={1.4}
          className={cn(
            "shrink-0",
            item.status === "failed" ? "text-destructive" : "text-primary",
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <strong title={item.file.name}>{item.file.name}</strong>
        <p>
          {formatBytes(item.file.size)} ·{" "}
          {item.status === "uploading"
            ? `${STATUS_LABEL.uploading} ${item.progress}%`
            : item.status === "failed" && item.error
              ? item.error
              : STATUS_LABEL[item.status]}
        </p>
        {(item.status === "uploading" || item.status === "finalizing") && (
          <Progress
            value={item.progress}
            className="h-1 mt-3"
            aria-label={`Upload progress for ${item.file.name}`}
          />
        )}
      </div>
      {item.status === "done" && item.videoId && (
        <Link className="upload-open" to={`/videos/${item.videoId}`}>
          Open <ArrowUpRight size={12} />
        </Link>
      )}
      {(item.status === "failed" || item.status === "cancelled") && (
        <button
          className="icon-button"
          aria-label={`Retry ${item.file.name}`}
          title="Retry"
          onClick={onRetry}
        >
          <RotateCcw size={14} />
        </button>
      )}
      <button
        className="icon-button"
        aria-label={
          active ? `Cancel upload of ${item.file.name}` : `Remove ${item.file.name}`
        }
        title={active ? "Cancel upload" : "Remove from list"}
        onClick={active ? onCancel : onDismiss}
      >
        <X size={15} />
      </button>
    </div>
  );
}
