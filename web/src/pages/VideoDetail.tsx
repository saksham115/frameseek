import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Film,
  Focus,
  Loader2,
  Maximize,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Search as SearchIcon,
  Scissors,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getShots,
  getTranscript,
  getVideo,
  renameVideo,
  retryTranscript,
} from "@/api/videos";
import { search } from "@/api/search";
import type { SearchMatch } from "@/api/types";
import { Button } from "@/components/ui/button";
import { MediaThumbnail, StatusBadge } from "@/components/MediaUI";
import { formatBytes, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import ClipTools, { ClipRangeSlider } from "@/components/ClipTools";
import { formatClipTime, type ClipRange } from "@/lib/clip-time";
import VideoActionsMenu, { useVideoMutations } from "@/components/VideoActions";
import { apiErrorMessage, errorStatus } from "@/lib/errors";
import { parseClipParam, shotAt, shotClipRange } from "@/lib/shots";
import "@/clip-tools.css";

export default function VideoDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [tab, setTab] = useState<"search" | "transcript" | "clips">("search");
  const [clipRange, setClipRange] = useState<ClipRange>([0, 0]);
  const [previewingClip, setPreviewingClip] = useState(false);
  const [exportingClip, setExportingClip] = useState(false);
  const clipPreviewRef = useRef<ClipRange | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mediaError, setMediaError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [transcriptFilter, setTranscriptFilter] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const {
    data: video,
    isError,
    error: videoError,
    refetch,
  } = useQuery({
    queryKey: ["video", id],
    queryFn: () => getVideo(id),
    retry: (count, e) => errorStatus(e) !== 404 && count < 1,
    refetchInterval: (q) =>
      ["processing", "queued", "uploaded"].includes(q.state.data?.status ?? "") ||
      q.state.data?.transcript_status === "processing"
        ? 4000
        : false,
  });
  // A retried transcript lands after the video itself is ready; pick it up when it does.
  useEffect(() => {
    if (video?.has_transcript)
      qc.invalidateQueries({ queryKey: ["transcript", id] });
  }, [video?.has_transcript, id, qc]);
  const ready = video?.status === "completed";
  const processing = ["uploaded", "queued", "processing"].includes(
    video?.status ?? "",
  );
  const canPlay = !!video?.video_url && !mediaError && !processing;
  const progress = Math.max(0, Math.min(100, video?.progress ?? 0));
  const {
    data: shots = [],
    isLoading: shotsLoading,
    isError: shotsError,
    refetch: refetchShots,
  } = useQuery({
    queryKey: ["shots", id],
    queryFn: () => getShots(id),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const {
    data: transcript,
    isLoading: transcriptLoading,
    isError: transcriptError,
    refetch: refetchTranscript,
  } = useQuery({
    queryKey: ["transcript", id],
    queryFn: () => getTranscript(id),
    enabled: !!video?.has_transcript,
  });
  const { reprocess } = useVideoMutations({ id, title: video?.title ?? "" });
  const transcriptRetry = useMutation({
    mutationFn: () => retryTranscript(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video", id] });
      toast.success("Transcription restarted. Check back in a few minutes.");
    },
    onError: (e) =>
      toast.error(apiErrorMessage(e, "Couldn’t restart transcription.")),
  });
  const filterText = transcriptFilter.trim().toLowerCase();
  const transcriptSegments = (transcript?.segments ?? []).filter(
    (s) => !filterText || s.text.toLowerCase().includes(filterText),
  );
  const currentShot = shotAt(shots, currentTime);
  const shotStripRef = useRef<HTMLDivElement>(null);
  // Keep the shot under the playhead visible as playback moves along the strip.
  useEffect(() => {
    const strip = shotStripRef.current;
    const tile = strip?.querySelector<HTMLElement>(".shot-tile.active");
    if (!strip || !tile) return;
    const left =
      tile.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    if (left < strip.scrollLeft || left + tile.offsetWidth > strip.scrollLeft + strip.clientWidth)
      strip.scrollTo({ left: Math.max(0, left - strip.clientWidth / 3), behavior: "smooth" });
  }, [currentShot?.shot_index, shots.length]);
  const fullDuration = duration || video?.duration_seconds || 0;
  const clipDuration =
    Math.floor(
      Math.min(fullDuration, video?.duration_seconds ?? fullDuration) * 100,
    ) / 100;
  const initialTime = Math.max(0, Number(params.get("t")) || 0);

  const stopClipPreview = () => {
    clipPreviewRef.current = null;
    setPreviewingClip(false);
  };
  const pausePlayer = () => {
    videoRef.current?.pause();
    stopClipPreview();
  };
  const changeClipRange = (range: ClipRange) => {
    if (clipPreviewRef.current) pausePlayer();
    setClipRange(range);
  };
  const openClips = (range?: ClipRange) => {
    if (tab !== "clips") pausePlayer();
    if (range) {
      setClipRange(range);
    } else if (clipRange[1] === 0 && clipDuration > 0) {
      // Start from the whole shot under the playhead — usually the clip people want.
      const shot = shotAt(shots, currentTime);
      if (shot) {
        setClipRange(shotClipRange(shot.start_seconds, shot.end_seconds, clipDuration));
      } else {
        const start =
          currentTime >= clipDuration - 0.1
            ? Math.max(0, clipDuration - 10)
            : Math.round(currentTime * 100) / 100;
        setClipRange([start, Math.min(clipDuration, start + 10)]);
      }
    }
    setTab("clips");
  };
  const clipShot = (start: number, end: number) => {
    if (!clipDuration || exportingClip) return;
    const range = shotClipRange(start, end, clipDuration);
    openClips(range);
    seekTo(range[0]);
  };
  const seekTo = (seconds: number, play = false) => {
    if (!canPlay) return;
    stopClipPreview();
    const el = videoRef.current;
    if (!el) return;
    const target = Math.max(
      0,
      Math.min(
        seconds,
        Number.isFinite(el.duration) ? el.duration : fullDuration || seconds,
      ),
    );
    if (el.readyState === 0) pendingSeek.current = target;
    else el.currentTime = target;
    setCurrentTime(target);
    if (play) el.play().catch(() => undefined);
  };
  const previewClip = (range: ClipRange) => {
    if (!canPlay) return;
    seekTo(range[0]);
    clipPreviewRef.current = range;
    setPreviewingClip(true);
    if (window.matchMedia("(max-width: 700px)").matches) {
      playerRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
    videoRef.current?.play().catch(() => {
      stopClipPreview();
      toast.error(
        "Couldn’t preview this selection. Reload the video and try again.",
      );
    });
  };
  useEffect(() => {
    if (!previewingClip) return;
    let frame: number;
    const tick = () => {
      const el = videoRef.current,
        selection = clipPreviewRef.current;
      if (!el || !selection) return;
      if (!el.seeking && el.currentTime >= selection[1]) {
        el.currentTime = selection[1];
        setCurrentTime(selection[1]);
        pausePlayer();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [previewingClip]);
  useEffect(() => {
    if (tab !== "clips" && clipPreviewRef.current) pausePlayer();
  }, [tab]);
  useEffect(() => {
    if (!canPlay) pausePlayer();
  }, [canPlay]);
  useEffect(() => {
    setClipRange([0, 0]);
    stopClipPreview();
    setDuration(0);
    setMediaError(false);
  }, [id]);
  const togglePlayback = () => {
    if (!canPlay) return;
    const el = videoRef.current;
    if (!el) return;
    if (el.paused)
      el.play().catch(() =>
        toast.error("We couldn’t play this video. Try loading it again."),
      );
    else el.pause();
  };
  useEffect(() => {
    seekTo(initialTime);
  }, [initialTime, id, canPlay]);
  // "?clip=start-end" (from a search result's "Clip" action) opens the trimmer on that shot.
  const clipParamValue = params.get("clip");
  const appliedClipParam = useRef<string | null>(null);
  useEffect(() => {
    const requested = parseClipParam(clipParamValue);
    if (!requested || !ready || !clipDuration || appliedClipParam.current === clipParamValue)
      return;
    appliedClipParam.current = clipParamValue;
    openClips(shotClipRange(requested[0], requested[1], clipDuration));
  }, [clipParamValue, ready, clipDuration]);
  useEffect(() => {
    if (!canPlay) return;
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        target.closest(
          "input, textarea, button, select, video, [contenteditable], [role=dialog], [role=slider]",
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayback();
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekTo((videoRef.current?.currentTime || 0) - 5);
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        seekTo((videoRef.current?.currentTime || 0) + 5);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [fullDuration, canPlay]);
  const runSearch = async () => {
    if (!query.trim() || isSearching || !ready) return;
    setSearchError(null);
    setIsSearching(true);
    setMatches(null);
    try {
      setMatches(await search(query.trim(), id));
    } catch (e) {
      setSearchError(
        errorStatus(e) === 429
          ? "You’ve used all your searches for this month."
          : "Search is temporarily unavailable. Please try again.",
      );
    } finally {
      setIsSearching(false);
    }
  };
  const saveTitle = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await renameVideo(id, title.trim());
      await qc.invalidateQueries({ queryKey: ["video", id] });
      await qc.invalidateQueries({ queryKey: ["videos"] });
      setEditing(false);
    } catch {
      toast.error("Couldn’t rename this video.");
    } finally {
      setSaving(false);
    }
  };
  if (isError)
    return (
      <div className="p-8">
        <div className="error-state" role="alert">
          {errorStatus(videoError) === 404 ? (
            "This video doesn’t exist anymore. It may have been deleted."
          ) : (
            <>
              This video couldn’t be loaded.{" "}
              <button className="underline" onClick={() => refetch()}>
                Try again
              </button>
            </>
          )}
        </div>
        <Link to="/" className="inline-block mt-5 text-primary">
          Back to library
        </Link>
      </div>
    );
  return (
    <div className={cn("editor-workspace", tab === "clips" && "is-trimming")}>
      <div className="editor-heading">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="icon-button" aria-label="Back to library">
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            {editing ? (
              <form
                className="rename-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveTitle();
                }}
              >
                <input
                  autoFocus
                  aria-label="Video title"
                  maxLength={500}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <button
                  className="icon-button"
                  aria-label="Save title"
                  disabled={saving || !title.trim()}
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancel rename"
                  onClick={() => setEditing(false)}
                >
                  <X size={15} />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="truncate">
                  {video?.title ?? "Opening workspace…"}
                </h1>
                {video && (
                  <button
                    className="icon-button"
                    aria-label="Rename video"
                    onClick={() => {
                      setTitle(video.title);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}
            <p>
              VIDEO WORKSPACE <span> / </span> ORIGINAL MEDIA
            </p>
          </div>
        </div>
        <div className="editor-export-actions">
          {video && <StatusBadge status={video.status} />}
          {video && (
            <VideoActionsMenu
              video={video}
              onDeleted={() => navigate("/", { replace: true })}
            />
          )}
          <Button
            className="studio-button editor-export-trigger"
            disabled={!ready || !clipDuration}
            onClick={() => {
              openClips();
              if (window.matchMedia("(max-width: 700px)").matches) {
                requestAnimationFrame(() =>
                  inspectorRef.current?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  }),
                );
              }
            }}
            aria-pressed={tab === "clips"}
          >
            <Scissors size={14} /> Export clip
          </Button>
        </div>
      </div>
      <div className="editor-grid">
        <section
          className="editor-main-panel"
          aria-label="Video preview and timeline"
        >
          <div className="panel-caption">
            <span>
              <span className="preview-dot" /> PREVIEW
            </span>
            <span>
              {video?.width && video?.height
                ? `${video.width} × ${video.height}`
                : "Original resolution"}
              {video?.fps ? ` · ${Math.round(video.fps)} FPS` : ""}
            </span>
          </div>
          <div
            className={cn("player-window", processing && "is-processing")}
            ref={playerRef}
            aria-busy={processing}
          >
            <div className="player-stage">
              {video?.video_url && !mediaError ? (
                <video
                  ref={videoRef}
                  key={id}
                  src={video.video_url}
                  poster={
                    ready ? (video.thumbnail_url ?? undefined) : undefined
                  }
                  playsInline
                  preload="metadata"
                  onClick={togglePlayback}
                  aria-label={`Preview of ${video.title}`}
                  aria-disabled={!canPlay}
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    setDuration(el.duration);
                    if (canPlay)
                      el.currentTime = Math.min(
                        pendingSeek.current ?? initialTime,
                        el.duration || 0,
                      );
                    pendingSeek.current = null;
                  }}
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                  onPlay={(e) => {
                    if (!canPlay) {
                      e.currentTarget.pause();
                      return;
                    }
                    // Only one preview should produce audio at a time.
                    document
                      .querySelector<HTMLVideoElement>(".clip-ready video")
                      ?.pause();
                    setPlaying(true);
                  }}
                  onPause={() => {
                    setPlaying(false);
                    stopClipPreview();
                  }}
                  onEnded={() => {
                    setPlaying(false);
                    stopClipPreview();
                  }}
                  onError={() => setMediaError(true)}
                />
              ) : (
                <div className="player-message">
                  <Film size={28} strokeWidth={1} />
                  <p>
                    {mediaError
                      ? "This preview couldn’t be loaded."
                      : "Preparing your preview…"}
                  </p>
                  {mediaError && (
                    <button
                      onClick={() => {
                        setMediaError(false);
                        refetch();
                      }}
                      className="underline"
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}
              {processing && (
                <div className="player-processing-overlay" role="status">
                  <Loader2
                    size={24}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  <h2>Preparing your video</h2>
                  <p>
                    Processing frames and transcript. Playback will unlock when
                    ready.
                  </p>
                  <div
                    className="player-processing-progress"
                    role="progressbar"
                    aria-label="Video processing"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <span className="player-processing-percent">
                    {progress}% complete
                  </span>
                </div>
              )}
            </div>
            <div className="player-transport">
              <div className="transport-playback">
                <button
                  className="icon-button"
                  aria-label="Back 5 seconds"
                  disabled={!canPlay}
                  onClick={() => seekTo(currentTime - 5)}
                >
                  <SkipBack size={14} />
                </button>
                <button
                  className="play-button"
                  aria-label={playing ? "Pause video" : "Play video"}
                  disabled={!canPlay}
                  onClick={togglePlayback}
                >
                  {playing ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Forward 5 seconds"
                  disabled={!canPlay}
                  onClick={() => seekTo(currentTime + 5)}
                >
                  <SkipForward size={14} />
                </button>
                <span className="transport-time">
                  <strong>{formatTimestamp(currentTime)}</strong>
                  <span> / {formatTimestamp(fullDuration)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="speed-select"
                  aria-label="Playback speed"
                  disabled={!canPlay}
                  value={speed}
                  onChange={(e) => {
                    const rate = Number(e.target.value);
                    setSpeed(rate);
                    if (videoRef.current) videoRef.current.playbackRate = rate;
                  }}
                >
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={muted ? "Unmute video" : "Mute video"}
                  disabled={!canPlay}
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = !muted;
                      setMuted(!muted);
                    }
                  }}
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <button
                  className="icon-button"
                  aria-label="Full screen"
                  disabled={!canPlay}
                  onClick={() =>
                    playerRef.current
                      ?.requestFullscreen?.()
                      .catch(() =>
                        toast.error(
                          "Full screen isn’t available in this browser.",
                        ),
                      )
                  }
                >
                  <Maximize size={15} />
                </button>
              </div>
            </div>
          </div>
          {video?.status === "failed" && (
            <div className="editor-status editor-failed" role="status">
              <span>
                Processing couldn’t finish. Your original video is still
                available, and retrying usually fixes it.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="studio-button"
                disabled={reprocess.isPending}
                onClick={() => reprocess.mutate()}
              >
                {reprocess.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                Retry processing
              </Button>
            </div>
          )}
          <section className="timeline-panel" aria-label="Timeline">
            <div className="panel-caption">
              <span>
                <Film size={12} /> SHOT NAVIGATOR
              </span>
              <span>
                {previewingClip
                  ? `Previewing ${formatClipTime(clipRange[1] - clipRange[0])} selection`
                  : shots.length
                    ? `${shots.length} ${shots.length === 1 ? "shot" : "shots"} · ${video?.frame_count ?? 0} frames`
                    : `${video?.frame_count ?? 0} indexed frames`}
              </span>
            </div>
            <div className="timeline-ruler">
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => (
                <span key={f}>{formatTimestamp(fullDuration * f)}</span>
              ))}
            </div>
            <input
              className="timeline-scrubber"
              aria-label="Video position"
              aria-valuetext={formatTimestamp(currentTime)}
              type="range"
              min="0"
              max={fullDuration || 1}
              step="0.05"
              value={currentTime}
              disabled={!fullDuration || !canPlay}
              onChange={(e) => seekTo(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) ${fullDuration ? (currentTime / fullDuration) * 100 : 0}%, hsl(var(--border)) 0%)`,
              }}
            />
            {tab === "clips" && ready && clipDuration > 0 && (
              <ClipRangeSlider
                range={clipRange}
                duration={clipDuration}
                onChange={changeClipRange}
                disabled={exportingClip}
              />
            )}
            {shotsError ? (
              <p className="editor-status" role="alert">
                Shots couldn’t be loaded.{" "}
                <button className="underline" onClick={() => refetchShots()}>
                  Retry
                </button>
              </p>
            ) : shots.length ? (
              <div className="filmstrip shotstrip" ref={shotStripRef}>
                {shots.map((shot) => {
                  const span = shot.end_seconds - shot.start_seconds;
                  const selected =
                    tab === "clips" &&
                    clipRange[0] < shot.end_seconds - 0.01 &&
                    clipRange[1] > shot.start_seconds + 0.01;
                  return (
                    <button
                      key={shot.shot_index}
                      className={cn(
                        "filmstrip-frame shot-tile",
                        currentShot?.shot_index === shot.shot_index && "active",
                        selected && "in-clip",
                      )}
                      style={{ flexGrow: Math.max(1, Math.min(6, span / 4)) }}
                      title={`${formatTimestamp(shot.start_seconds)}–${formatTimestamp(shot.end_seconds)} · ${shot.frame_count} similar ${shot.frame_count === 1 ? "frame" : "frames"}`}
                      aria-label={
                        tab === "clips"
                          ? `Select shot ${formatTimestamp(shot.start_seconds)} to ${formatTimestamp(shot.end_seconds)} for the clip`
                          : `Jump to shot at ${formatTimestamp(shot.start_seconds)}`
                      }
                      disabled={!canPlay || (tab === "clips" && exportingClip)}
                      onClick={() =>
                        tab === "clips"
                          ? clipShot(shot.start_seconds, shot.end_seconds)
                          : seekTo(shot.start_seconds)
                      }
                    >
                      <MediaThumbnail src={shot.thumbnail_url || shot.frame_url} />
                      <span>{formatTimestamp(shot.start_seconds)}</span>
                      {shot.frame_count > 1 && (
                        <span className="shot-count">×{shot.frame_count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="filmstrip-empty">
                {shotsLoading
                  ? "Finding shots…"
                  : ready
                    ? "No frames available"
                    : "Your shots will appear here"}
              </div>
            )}
            <div className="timeline-footer">
              <span>
                {processing
                  ? "The timeline will unlock when processing is complete"
                  : tab === "clips"
                    ? "Click a shot to select it, or drag the handles to fine-tune"
                    : "Similar frames are grouped into shots. Click one to jump there"}
              </span>
              {canPlay ? (
                <span>
                  <kbd>Space</kbd> Play / pause
                </span>
              ) : null}
            </div>
          </section>
          <div className="video-file-info">
            <span>
              <Film size={12} /> Original video
            </span>
            <span>
              {formatBytes(video?.file_size_bytes ?? 0)}
              <span className="mx-3 opacity-30">/</span>
              {video
                ? new Date(video.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : ""}
            </span>
          </div>
        </section>
        <aside
          ref={inspectorRef}
          className="editor-inspector"
          aria-label="Video tools"
        >
          <div className="inspector-tabs">
            <button
              onClick={() => setTab("search")}
              className={cn(tab === "search" && "active")}
              aria-pressed={tab === "search"}
            >
              <SearchIcon size={14} /> Visual search
            </button>
            <button
              onClick={() => setTab("transcript")}
              className={cn(tab === "transcript" && "active")}
              aria-pressed={tab === "transcript"}
            >
              <FileText size={14} /> Transcript
            </button>
            <button
              onClick={() => openClips()}
              className={cn(tab === "clips" && "active")}
              aria-pressed={tab === "clips"}
            >
              <Scissors size={14} /> Clips
            </button>
          </div>
          {tab === "search" ? (
            <div className="inspector-content">
              <div className="inspector-intro">
                <h2>Find something in this video</h2>
                <p>Describe the moment you’re looking for.</p>
              </div>
              <form
                className="inspector-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
              >
                <input
                  aria-label="Search within this video"
                  placeholder="A scene, object, or action…"
                  value={query}
                  maxLength={500}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={!ready}
                />
                <button
                  aria-label="Search video"
                  disabled={!ready || isSearching || !query.trim()}
                >
                  {isSearching ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <SearchIcon size={15} />
                  )}
                </button>
              </form>
              {!ready && (
                <p className="inspector-hint">
                  Visual search becomes available when processing is complete.
                </p>
              )}
              {searchError && (
                <p role="alert" className="text-destructive text-xs mt-5">
                  {searchError}
                </p>
              )}
              {isSearching && (
                <div
                  className="space-y-3 mt-6"
                  role="status"
                  aria-label="Searching video"
                >
                  {[0, 1, 2].map((i) => (
                    <div className="skeleton h-20" key={i} />
                  ))}
                </div>
              )}
              {matches ? (
                <>
                  <div className="inspector-results-label">
                    {matches.length} MATCHING {matches.length === 1 ? "SHOT" : "SHOTS"}
                  </div>
                  <div className="inspector-results">
                    {matches.length ? (
                      matches.map((m, i) => {
                        const hasShot = m.shot_start_seconds != null && m.shot_end_seconds != null;
                        return (
                          <div className="inspector-result-row" key={i}>
                            <button
                              className="inspector-result"
                              onClick={() => seekTo(m.timestamp_seconds, true)}
                              aria-label={`Play match at ${formatTimestamp(m.timestamp_seconds)}`}
                            >
                              <div className="result-thumb">
                                <MediaThumbnail src={m.frame_url} />
                              </div>
                              <div>
                                <strong>
                                  {hasShot
                                    ? `${formatTimestamp(m.shot_start_seconds!)}–${formatTimestamp(m.shot_end_seconds!)}`
                                    : formatTimestamp(m.timestamp_seconds)}
                                </strong>
                                <span>
                                  {Math.round(m.score * 100)}% visual similarity
                                  {(m.match_count ?? 1) > 1 && ` · ${m.match_count} frames`}
                                </span>
                              </div>
                              <Play size={12} />
                            </button>
                            {hasShot && (
                              <button
                                className="icon-button result-clip"
                                title="Clip this shot"
                                aria-label={`Clip the shot from ${formatTimestamp(m.shot_start_seconds!)} to ${formatTimestamp(m.shot_end_seconds!)}`}
                                disabled={!canPlay || !clipDuration}
                                onClick={() => clipShot(m.shot_start_seconds!, m.shot_end_seconds!)}
                              >
                                <Scissors size={13} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="inspector-hint">
                        No matching frames. Try a simpler description.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                !isSearching &&
                !searchError && (
                  <div className="inspector-empty">
                    <div className="empty-icon">
                      <Focus size={25} strokeWidth={1} />
                    </div>
                    <h3>Less scrubbing. More finding.</h3>
                    <p>
                      Your matching moments will appear here, ready to play.
                    </p>
                  </div>
                )
              )}
            </div>
          ) : tab === "transcript" ? (
            <div className="inspector-content">
              <div className="transcript-heading">
                <div>
                  <h2>Every word, in context.</h2>
                  <p>
                    {transcript?.language
                      ? `${transcript.language} · ${transcript.segments.length} segments`
                      : "Audio transcript"}
                  </p>
                </div>
                {transcript?.segments.length ? (
                  <button
                    className="icon-button"
                    aria-label="Copy transcript"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(
                          transcript.segments.map((s) => s.text).join("\n"),
                        )
                        .then(() => toast.success("Transcript copied."))
                        .catch(() =>
                          toast.error("Couldn’t copy the transcript."),
                        )
                    }
                  >
                    <Copy size={14} />
                  </button>
                ) : null}
              </div>
              {transcript?.segments.length ? (
                <label className="inspector-search transcript-find">
                  <SearchIcon size={13} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Find in transcript"
                    placeholder="Find a word or phrase…"
                    value={transcriptFilter}
                    onChange={(e) => setTranscriptFilter(e.target.value)}
                  />
                  {filterText && (
                    <span className="transcript-find-count" aria-live="polite">
                      {transcriptSegments.length} found
                    </span>
                  )}
                </label>
              ) : null}
              {transcriptLoading ? (
                <p className="inspector-hint" role="status">
                  Loading transcript…
                </p>
              ) : transcriptError ? (
                <p className="inspector-hint" role="alert">
                  Transcript couldn’t be loaded.{" "}
                  <button
                    className="underline"
                    onClick={() => refetchTranscript()}
                  >
                    Retry
                  </button>
                </p>
              ) : transcript?.segments.length ? (
                <div className="transcript-list">
                  {!transcriptSegments.length && (
                    <p className="inspector-hint">
                      Nothing in the transcript matches “{transcriptFilter.trim()}”.
                    </p>
                  )}
                  {transcriptSegments.map((s) => (
                    <button
                      className={cn(
                        "transcript-segment",
                        currentTime >= s.start_seconds &&
                          currentTime < s.end_seconds &&
                          "active",
                      )}
                      key={s.segment_id}
                      onClick={() => seekTo(s.start_seconds, true)}
                    >
                      <span>{formatTimestamp(s.start_seconds)}</span>
                      <p>
                        <Highlight text={s.text} term={filterText} />
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="inspector-empty">
                  <div className="empty-icon">
                    <FileText size={22} strokeWidth={1.2} />
                  </div>
                  <h3>
                    {video?.transcript_status === "failed"
                      ? "Transcription didn’t finish"
                      : ready
                        ? "No transcript available"
                        : "Listening for the details"}
                  </h3>
                  <p>
                    {video?.transcript_status === "failed"
                      ? "Something went wrong while transcribing the audio. Your video and visual search still work."
                      : ready
                        ? "This video has no spoken audio to transcribe."
                        : "Spoken audio will appear here after processing."}
                  </p>
                  {video?.transcript_status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="studio-button mt-5"
                      disabled={transcriptRetry.isPending}
                      onClick={() => transcriptRetry.mutate()}
                    >
                      {transcriptRetry.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RotateCcw />
                      )}
                      Retry transcription
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : null}
          {video && (
            <ClipTools
              key={id}
              videoId={id}
              title={video.title}
              duration={clipDuration}
              currentTime={currentTime}
              range={clipRange}
              onRangeChange={changeClipRange}
              onPreview={previewClip}
              onPause={pausePlayer}
              previewing={previewingClip}
              active={tab === "clips"}
              ready={ready}
              onBusyChange={setExportingClip}
            />
          )}
          <div className="inspector-bottom">
            <span className="workspace-dot" />
            <span>Focused on this video</span>
            <Film size={12} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, from)) {
    parts.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + term.length)}</mark>);
    from = at + term.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
