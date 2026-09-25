import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  FileVideo,
  LockKeyhole,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createUploadTarget, finalizeUpload, uploadToBlob } from "@/api/videos";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/MediaUI";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
const MAX_BYTES = 500 * 1024 * 1024;
export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pick = (f: File | null) => {
    if (!f || progress !== null) return;
    if (!/\.(mp4|mov|webm)$/i.test(f.name)) {
      toast.error("Choose an MP4, MOV, or WebM video.");
      return;
    }
    if (f.size > MAX_BYTES || f.size === 0) {
      toast.error(
        f.size === 0
          ? "This file is empty. Choose another video."
          : `The limit is ${formatBytes(MAX_BYTES)} per video.`,
      );
      return;
    }
    setFile(f);
  };
  const start = async () => {
    if (!file || progress !== null) return;
    try {
      setProgress(0);
      const { video_id, upload_url } = await createUploadTarget(
        file.name,
        file.size,
        file.type,
      );
      await uploadToBlob(upload_url, file, (frac) =>
        setProgress(Math.round(frac * 100)),
      );
      await finalizeUpload(video_id);
      await qc.invalidateQueries({ queryKey: ["videos"] });
      await useAuth.getState().loadSession();
      toast.success("Your video is in. Preparing your workspace…");
      navigate(`/videos/${video_id}`);
    } catch {
      toast.error("Upload failed. Please try again.");
      setProgress(null);
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow="START SOMETHING GOOD"
        title="Bring your footage in."
        description="One upload. Every moment at your fingertips."
      />
      <div className="upload-layout">
        <div>
          <button
            type="button"
            className={cn("upload-dropzone", dragging && "dragging")}
            disabled={progress !== null}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <div className="empty-icon">
              {file ? (
                <Check size={27} strokeWidth={1.4} />
              ) : (
                <UploadCloud size={27} strokeWidth={1.4} />
              )}
            </div>
            <h2>{file ? "Ready when you are" : "Drop your video here"}</h2>
            <p>
              {file ? (
                "Click to choose a different file"
              ) : (
                <>
                  or <span className="text-primary">browse files</span> from
                  your computer
                </>
              )}
            </p>
            <div className="file-formats">
              <span>MP4</span>
              <span>MOV</span>
              <span>WEBM</span>
              <span>UP TO 500 MB</span>
            </div>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            hidden
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {file && (
            <div className="upload-selection">
              <FileVideo
                size={24}
                strokeWidth={1.4}
                className="text-primary shrink-0"
              />
              <div className="min-w-0 flex-1">
                <strong>{file.name}</strong>
                <p>
                  {formatBytes(file.size)} ·{" "}
                  {progress === null
                    ? "Ready to import"
                    : progress === 100
                      ? "Preparing your video…"
                      : "Uploading your video…"}
                </p>
              </div>
              {progress === null && (
                <button
                  className="icon-button"
                  aria-label="Remove selected file"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
          {progress !== null && (
            <div className="mt-5" role="status">
              <Progress value={progress} className="h-1" />
              <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">
                {progress}%
              </p>
            </div>
          )}
          <div className="flex justify-between items-center mt-6 gap-5">
            <span className="text-[10px] text-muted-foreground">
              Keep this page open while your video uploads.
            </span>
            <Button
              className="studio-button"
              disabled={!file || progress !== null}
              onClick={start}
            >
              {progress !== null ? "Importing…" : "Import video"}
              <ArrowRight />
            </Button>
          </div>
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
