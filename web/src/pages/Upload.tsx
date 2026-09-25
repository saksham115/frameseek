import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { createUploadTarget, finalizeUpload, uploadToBlob } from "@/api/videos";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/store/auth";

const MAX_BYTES = 500 * 1024 * 1024;

const Upload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error(`That file is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setFile(f);
  };

  const start = async () => {
    if (!file) return;
    try {
      setProgress(0);
      const { video_id, upload_url } = await createUploadTarget(file.name, file.size, file.type);
      await uploadToBlob(upload_url, file, (frac) => setProgress(Math.round(frac * 100)));
      await finalizeUpload(video_id);
      await qc.invalidateQueries({ queryKey: ["videos"] });
      await useAuth.getState().loadSession();
      toast.success("Upload complete — processing started.");
      navigate(`/videos/${video_id}`);
    } catch {
      toast.error("Upload failed. Please try again.");
      setProgress(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Upload a video</h1>
      <p className="text-muted-foreground mb-8">Up to {formatBytes(MAX_BYTES)}. MP4, MOV, and WebM.</p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-card px-6 py-16 text-center transition-colors hover:border-primary"
      >
        <UploadCloud className="mx-auto h-10 w-10 text-primary" />
        <p className="mt-4 font-medium">{file ? file.name : "Drop a video here, or click to browse"}</p>
        {file && <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>

      {progress !== null && (
        <div className="mt-6">
          <Progress value={progress} />
          <p className="mt-2 text-center font-mono text-sm text-muted-foreground">{progress}%</p>
        </div>
      )}

      <Button className="mt-6 w-full" disabled={!file || progress !== null} onClick={start}>
        {progress !== null ? "Uploading…" : "Start upload"}
      </Button>
    </div>
  );
};

export default Upload;
