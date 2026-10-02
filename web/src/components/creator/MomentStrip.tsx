import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Film, Loader2, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import type { Moment, TemplateRecipe } from "@/api/creations";
import type { Video } from "@/api/types";
import { getShots, listVideos } from "@/api/videos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaThumbnail } from "@/components/MediaUI";
import { formatClipTime, parseClipTime } from "@/lib/clip-time";
import { momentsTotal, newMomentId } from "@/lib/creator";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

function TimeField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(formatClipTime(value));
  useEffect(() => setText(formatClipTime(value)), [value]);
  const commit = () => {
    const parsed = parseClipTime(text);
    if (parsed === null) setText(formatClipTime(value));
    else if (parsed !== value) onCommit(parsed);
  };
  return (
    <label className="moment-time">
      <span>{label}</span>
      <input
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export default function MomentStrip({
  recipe,
  moments,
  videos,
  selectedId,
  onSelect,
  onChange,
  maxCreationSeconds,
}: {
  recipe: TemplateRecipe;
  moments: Moment[];
  videos: Record<string, Video | undefined>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (moments: Moment[]) => void;
  maxCreationSeconds: number;
}) {
  const [adding, setAdding] = useState(false);
  const rules = recipe.moments;
  const total = momentsTotal(moments);
  const limit = Math.min(rules.max_total_seconds, maxCreationSeconds);
  const full = moments.length >= rules.max;

  const patch = (id: string, change: Partial<Moment>) =>
    onChange(moments.map((m) => (m.id === id ? { ...m, ...change } : m)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...moments];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <section className="moment-strip" aria-label="Moments">
      <div className="moment-strip-head">
        <span>
          MOMENTS <b>{moments.length}</b>/{rules.max}
          {moments.length < rules.min && <em> · add at least {rules.min}</em>}
        </span>
        <span className={cn(total > limit && "is-over")}>
          {formatClipTime(total)} of {formatTimestamp(limit)} max
        </span>
      </div>
      <div className="moment-list">
        {moments.map((m, i) => {
          const video = videos[m.video_id];
          const len = m.end - m.start;
          const tooLong = rules.max_moment_seconds ? len > rules.max_moment_seconds + 0.05 : false;
          const duration = video?.duration_seconds ?? Infinity;
          return (
            <div
              key={m.id}
              className={cn("moment-item", selectedId === m.id && "is-selected", tooLong && "is-invalid")}
              onClick={() => onSelect(m.id)}
            >
              <div className="moment-thumb">
                <MediaThumbnail src={video?.thumbnail_url ?? null} />
                <span className="moment-index">{i + 1}</span>
              </div>
              <div className="moment-body">
                <strong title={video?.title}>{video?.title ?? "Video unavailable"}</strong>
                <div className="moment-times">
                  <TimeField
                    label="In"
                    value={m.start}
                    onCommit={(v) => patch(m.id, { start: Math.max(0, Math.min(v, m.end - 0.5)) })}
                  />
                  <TimeField
                    label="Out"
                    value={m.end}
                    onCommit={(v) => patch(m.id, { end: Math.min(duration, Math.max(v, m.start + 0.5)) })}
                  />
                </div>
                <span className="moment-length">
                  {formatClipTime(len)}
                  {tooLong && ` · up to ${rules.max_moment_seconds}s here`}
                </span>
              </div>
              <div className="moment-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-button"
                  aria-label={m.keep_audio ? "Mute this moment" : "Keep this moment's sound"}
                  title={m.keep_audio ? "Original sound on" : "Original sound off"}
                  onClick={() => patch(m.id, { keep_audio: !m.keep_audio })}
                >
                  {m.keep_audio ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
                <button className="icon-button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowLeft size={13} />
                </button>
                <button className="icon-button" aria-label="Move later" disabled={i === moments.length - 1} onClick={() => move(i, 1)}>
                  <ArrowRight size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Remove moment"
                  onClick={() => onChange(moments.filter((x) => x.id !== m.id))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
        <button className="moment-add" onClick={() => setAdding(true)} disabled={full}>
          <Plus size={16} />
          <span>{full ? `This template takes ${rules.max}` : "Add a moment"}</span>
        </button>
      </div>
      <AddMomentDialog
        open={adding}
        onOpenChange={setAdding}
        maxSeconds={rules.max_moment_seconds ?? 15}
        onAdd={(m) => {
          onChange([...moments, m]);
          onSelect(m.id);
          setAdding(false);
        }}
      />
    </section>
  );
}

function AddMomentDialog({
  open,
  onOpenChange,
  onAdd,
  maxSeconds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (m: Moment) => void;
  maxSeconds: number;
}) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const { data: videos, isLoading } = useQuery({ queryKey: ["videos", "all-ready"], queryFn: listVideos, enabled: open });
  const ready = (videos ?? []).filter((v) => v.status === "completed");
  const video = ready.find((v) => v.id === videoId);
  const { data: shots, isLoading: shotsLoading } = useQuery({
    queryKey: ["shots", videoId],
    queryFn: () => getShots(videoId!),
    enabled: open && !!videoId,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setVideoId(null);
      }}
    >
      <DialogContent className="add-moment-dialog">
        <DialogHeader>
          <DialogTitle>{video ? video.title : "Add a moment"}</DialogTitle>
          <DialogDescription>
            {video ? "Pick a shot. You can trim it afterwards." : "Choose a video, then a shot from it."}
          </DialogDescription>
        </DialogHeader>
        {!video ? (
          isLoading ? (
            <div className="add-moment-loading">
              <Loader2 className="animate-spin" size={16} />
            </div>
          ) : ready.length ? (
            <div className="add-moment-grid">
              {ready.map((v) => (
                <button key={v.id} className="add-moment-card" onClick={() => setVideoId(v.id)}>
                  <MediaThumbnail src={v.thumbnail_url} />
                  <span>{v.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="add-moment-empty">
              <Film size={14} /> Videos appear here once they finish processing.
            </p>
          )
        ) : (
          <>
            <Button variant="outline" className="studio-button w-fit" onClick={() => setVideoId(null)}>
              <ArrowLeft /> All videos
            </Button>
            {shotsLoading ? (
              <div className="add-moment-loading">
                <Loader2 className="animate-spin" size={16} />
              </div>
            ) : (
              <div className="add-moment-grid">
                {(shots ?? []).map((s) => (
                  <button
                    key={s.shot_index}
                    className="add-moment-card"
                    onClick={() =>
                      onAdd({
                        id: newMomentId(),
                        video_id: video.id,
                        start: Math.round(s.start_seconds * 100) / 100,
                        end: Math.round(Math.min(s.end_seconds, s.start_seconds + maxSeconds) * 100) / 100,
                        crop: null,
                        keep_audio: true,
                      })
                    }
                  >
                    <MediaThumbnail src={s.thumbnail_url ?? s.frame_url} />
                    <span>
                      {formatClipTime(s.start_seconds)} · {Math.round(s.end_seconds - s.start_seconds)}s
                    </span>
                  </button>
                ))}
                {!shots?.length && (
                  <button
                    className="add-moment-card"
                    onClick={() =>
                      onAdd({ id: newMomentId(), video_id: video.id, start: 0,
                        end: Math.min(video.duration_seconds ?? maxSeconds, maxSeconds), crop: null, keep_audio: true })
                    }
                  >
                    <MediaThumbnail src={video.thumbnail_url} />
                    <span>From the start</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
