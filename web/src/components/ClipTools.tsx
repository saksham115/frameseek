import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Play,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import {
  createClip,
  deleteClip,
  downloadClip,
  getClip,
  listClips,
  type Clip,
} from "@/api/clips";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaThumbnail } from "@/components/MediaUI";
import { formatBytes } from "@/lib/format";
import {
  formatClipTime,
  parseClipTime,
  rangeError,
  type ClipRange,
} from "@/lib/clip-time";
import { useAuth } from "@/store/auth";

export function ClipRangeSlider({
  range,
  duration,
  onChange,
  disabled,
}: {
  range: ClipRange;
  duration: number;
  onChange: (range: ClipRange) => void;
  disabled?: boolean;
}) {
  return (
    <div className="clip-range-control">
      <div className="clip-range-caption">
        <span>
          <Scissors size={11} /> SELECTED RANGE
        </span>
        <span>
          {formatClipTime(range[0])} — {formatClipTime(range[1])}
        </span>
      </div>
      <SliderPrimitive.Root
        className="clip-range-slider"
        min={0}
        max={duration || 1}
        step={0.01}
        value={range}
        minStepsBetweenThumbs={10}
        onValueChange={(v) => onChange(v as ClipRange)}
        disabled={disabled}
      >
        <SliderPrimitive.Track className="clip-range-track">
          <SliderPrimitive.Range className="clip-range-fill" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="clip-range-thumb"
          aria-label="Clip in point"
          aria-valuetext={formatClipTime(range[0])}
        >
          <span />
        </SliderPrimitive.Thumb>
        <SliderPrimitive.Thumb
          className="clip-range-thumb"
          aria-label="Clip out point"
          aria-valuetext={formatClipTime(range[1])}
        >
          <span />
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Root>
    </div>
  );
}

export default function ClipTools({
  videoId,
  title,
  duration,
  currentTime,
  range,
  onRangeChange,
  onPreview,
  onPause,
  previewing,
  active,
  ready,
  onBusyChange,
}: {
  videoId: string;
  title: string;
  duration: number;
  currentTime: number;
  range: ClipRange;
  onRangeChange: (range: ClipRange) => void;
  onPreview: (range: ClipRange) => void;
  onPause: () => void;
  previewing: boolean;
  active: boolean;
  ready: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const qc = useQueryClient();
  const [inPoint, setInPoint] = useState(formatClipTime(range[0]));
  const [outPoint, setOutPoint] = useState(formatClipTime(range[1]));
  const [name, setName] = useState(`${title} — clip`.slice(0, 150));
  const [creating, setCreating] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selected, setSelected] = useState<Clip | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [previewError, setPreviewError] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Clip | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["clips", videoId, page],
    queryFn: () => listClips(videoId, page),
    enabled: active && ready,
  });
  useEffect(() => {
    setInPoint(formatClipTime(range[0]));
    setOutPoint(formatClipTime(range[1]));
  }, [range[0], range[1]]);
  useEffect(() => {
    if (selected && active)
      resultRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [selected?.clip_id]);
  const start = parseClipTime(inPoint),
    end = parseClipTime(outPoint);
  const validation = rangeError(start, end, duration);
  const valid = !validation && !!name.trim() && ready && !!duration;
  const commitPoints = () => {
    if (
      start !== null &&
      end !== null &&
      start >= 0 &&
      end <= duration &&
      end - start >= 0.099
    )
      onRangeChange([start, end]);
  };
  const setAtPlayhead = (edge: "in" | "out") => {
    const point =
      Math.round(Math.min(duration, Math.max(0, currentTime)) * 100) / 100;
    if (edge === "in") {
      const from = Math.min(point, Math.max(0, duration - 0.1));
      onRangeChange([
        from,
        Math.min(duration, Math.max(end ?? range[1], from + 0.1)),
      ]);
    } else {
      const to = Math.max(0.1, point);
      onRangeChange([
        Math.max(0, Math.min(start ?? range[0], to - 0.1)),
        Math.min(duration, to),
      ]);
    }
  };
  const refreshClips = () => {
    void qc.invalidateQueries({ queryKey: ["clips", videoId] });
    // Keep the sidebar quota current without remounting the workspace.
    void useAuth.getState().loadSession();
  };
  const exportClip = async () => {
    if (!valid || creating || start === null || end === null) return;
    onPause();
    commitPoints();
    setCreating(true);
    onBusyChange(true);
    setExportError("");
    try {
      const clip = await createClip(videoId, name.trim(), start, end);
      setSelected(clip);
      setPreviewError(false);
      setPage(1);
      refreshClips();
      toast.success("Clip exported. Your MP4 is ready to download.");
    } catch (error) {
      const detail = isAxiosError(error) ? error.response?.data?.detail : null;
      setExportError(
        typeof detail === "string"
          ? detail
          : "The export couldn’t finish. Check your connection and try again. Your selection is saved.",
      );
      void qc.invalidateQueries({ queryKey: ["clips", videoId] });
    } finally {
      setCreating(false);
      onBusyChange(false);
    }
  };
  const saveDownload = async (clip: Clip) => {
    if (downloading) return;
    setDownloading(clip.clip_id);
    try {
      await downloadClip(clip.clip_id);
    } catch {
      toast.error("Couldn’t download this clip. Please try again.");
    } finally {
      setDownloading(null);
    }
  };
  const showPreview = async (clip: Clip) => {
    onPause();
    setLoadingPreview(true);
    setPreviewError(false);
    setSelected(null);
    try {
      setSelected(await getClip(clip.clip_id));
    } catch {
      toast.error("Couldn’t load the clip preview. Please try again.");
    } finally {
      setLoadingPreview(false);
    }
  };
  const removeClip = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteClip(toDelete.clip_id);
      if (selected?.clip_id === toDelete.clip_id) setSelected(null);
      if (data?.clips.length === 1 && page > 1) setPage((p) => p - 1);
      setToDelete(null);
      refreshClips();
      toast.success("Clip deleted.");
    } catch {
      toast.error("Couldn’t delete the clip. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="inspector-content clip-tools" hidden={!active}>
      <div className="inspector-intro">
        <h2>Keep the moment.</h2>
        <p>Choose a range. Make it yours.</p>
      </div>
      {!ready ? (
        <p className="inspector-hint">
          Clip export is available when video processing finishes.
        </p>
      ) : (
        <>
          <form
            className="clip-export-form"
            onSubmit={(e) => {
              e.preventDefault();
              void exportClip();
            }}
          >
            <fieldset disabled={creating || !duration}>
              <div className="clip-time-fields">
                <div>
                  <label htmlFor="clip-in">IN POINT</label>
                  <div className="clip-time-input">
                    <input
                      id="clip-in"
                      aria-label="Clip start time"
                      aria-describedby={
                        validation ? "clip-range-error" : "clip-time-help"
                      }
                      aria-invalid={!!validation}
                      value={inPoint}
                      onChange={(e) => setInPoint(e.target.value)}
                      onBlur={commitPoints}
                    />
                    <button
                      type="button"
                      title="Set in point at playhead"
                      aria-label="Set in point at playhead"
                      onClick={() => setAtPlayhead("in")}
                    >
                      I
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="clip-out">OUT POINT</label>
                  <div className="clip-time-input">
                    <input
                      id="clip-out"
                      aria-label="Clip end time"
                      aria-describedby={
                        validation ? "clip-range-error" : "clip-time-help"
                      }
                      aria-invalid={!!validation}
                      value={outPoint}
                      onChange={(e) => setOutPoint(e.target.value)}
                      onBlur={commitPoints}
                    />
                    <button
                      type="button"
                      title="Set out point at playhead"
                      aria-label="Set out point at playhead"
                      onClick={() => setAtPlayhead("out")}
                    >
                      O
                    </button>
                  </div>
                </div>
              </div>
              <div className="clip-duration">
                <span>DURATION</span>
                <strong>
                  {start !== null && end !== null && end > start
                    ? formatClipTime(end - start)
                    : "—"}
                </strong>
                <span>MAX 02:00</span>
              </div>
              {validation ? (
                <p id="clip-range-error" role="alert" className="clip-error">
                  {validation}
                </p>
              ) : (
                <p id="clip-time-help" className="clip-help">
                  Timecode or seconds · I / O use the playhead.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="clip-preview-button"
                disabled={!!validation || !duration}
                onClick={() => {
                  if (previewing) onPause();
                  else if (start !== null && end !== null) {
                    commitPoints();
                    onPreview([start, end]);
                  }
                }}
              >
                {previewing ? <Pause size={13} /> : <Play size={13} />}
                {previewing ? "Stop preview" : "Preview selection"}
              </Button>
              <label className="clip-name-label" htmlFor="clip-name">
                CLIP NAME
              </label>
              <input
                id="clip-name"
                className="clip-name-input"
                value={name}
                maxLength={150}
                onChange={(e) => setName(e.target.value)}
                placeholder="Give this moment a name"
              />
            </fieldset>
            <div className="clip-format">
              <span>MP4</span>
              <span>Original resolution · Video + audio</span>
            </div>
            {exportError && (
              <p className="clip-error" role="alert">
                {exportError}
              </p>
            )}
            <Button
              className="studio-button clip-export-button"
              disabled={!valid || creating}
              type="submit"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Scissors size={14} />
              )}
              {creating ? "Rendering clip…" : "Export MP4"}
            </Button>
            {creating && (
              <p role="status" className="clip-help">
                Rendering your selection. Keep this workspace open.
              </p>
            )}
          </form>
          {loadingPreview && (
            <p role="status" className="clip-help">
              Loading exported clip…
            </p>
          )}
          {selected && (
            <section
              ref={resultRef}
              className="clip-ready"
              aria-label="Exported clip"
            >
              <div className="clip-ready-heading">
                <span>
                  <Check size={12} /> READY TO DOWNLOAD
                </span>
                <button
                  className="icon-button"
                  aria-label="Close clip preview"
                  onClick={() => setSelected(null)}
                >
                  <X size={12} />
                </button>
              </div>
              {previewError ? (
                <p className="clip-error">
                  Preview expired or unavailable.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => showPreview(selected)}
                  >
                    Reload preview
                  </button>
                </p>
              ) : (
                selected.clip_url &&
                active && (
                  <video
                    key={selected.clip_url}
                    src={selected.clip_url}
                    poster={selected.thumbnail_url ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Exported clip: ${selected.title}`}
                    onPlay={onPause}
                    onError={() => setPreviewError(true)}
                  />
                )
              )}
              <h3>{selected.title}</h3>
              <p>
                {formatClipTime(selected.duration_seconds)} ·{" "}
                {formatBytes(selected.file_size_bytes ?? 0)}
              </p>
              <Button
                variant="outline"
                className="clip-download-button"
                disabled={!!downloading}
                onClick={() => saveDownload(selected)}
              >
                {downloading === selected.clip_id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Download size={13} />
                )}{" "}
                Download MP4
              </Button>
            </section>
          )}
          <section className="clip-library" aria-label="Saved clips">
            <div className="clip-library-heading">
              <h3>SAVED CLIPS</h3>
              <span>
                {String(data?.pagination.total ?? 0).padStart(2, "0")}
              </span>
            </div>
            {isLoading ? (
              <p role="status" className="clip-help">
                Loading clips…
              </p>
            ) : isError ? (
              <p className="clip-error" role="alert">
                Couldn’t load saved clips.{" "}
                <button className="underline" onClick={() => refetch()}>
                  Retry
                </button>
              </p>
            ) : data?.clips.length ? (
              <>
                {data.clips.map((clip) => (
                  <div className="saved-clip" key={clip.clip_id}>
                    <button
                      className="saved-clip-preview"
                      aria-label={`Preview clip ${clip.title}`}
                      onClick={() => showPreview(clip)}
                    >
                      <MediaThumbnail src={clip.thumbnail_url} />
                      <span>
                        <strong>{clip.title}</strong>
                        <small>
                          {formatClipTime(clip.start_time)} —{" "}
                          {formatClipTime(clip.end_time)}
                        </small>
                      </span>
                    </button>
                    <div className="saved-clip-actions">
                      <button
                        className="icon-button"
                        aria-label={`Download clip ${clip.title}`}
                        disabled={!!downloading}
                        onClick={() => saveDownload(clip)}
                      >
                        <Download size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete clip ${clip.title}`}
                        onClick={() => setToDelete(clip)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {data.pagination.total_pages > 1 && (
                  <div className="clip-pagination">
                    <button
                      className="icon-button"
                      aria-label="Previous clips"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span>
                      {page} / {data.pagination.total_pages}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Next clips"
                      disabled={page >= data.pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="clips-empty">
                <Scissors size={18} strokeWidth={1.3} />
                <p>Your exported moments will live here.</p>
              </div>
            )}
          </section>
        </>
      )}
      <Dialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setToDelete(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete this clip?</DialogTitle>
          <DialogDescription>
            “{toDelete?.title}” will be removed from your saved clips. Your
            original video stays in your library.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setToDelete(null)}
            >
              Keep clip
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={removeClip}
            >
              {deleting ? "Deleting…" : "Delete clip"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
