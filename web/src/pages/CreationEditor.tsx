import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Clapperboard, Download, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteRender,
  downloadRender,
  getCaptions,
  getCreation,
  getMusic,
  getRender,
  getTemplates,
  listAssets,
  listRenders,
  RENDER_ACTIVE,
  startRender,
  updateCreation,
  type CaptionLine,
  type Creation,
  type CreationPatch,
  type CreationSettings,
  type Crop,
  type Moment,
  type Render,
  type TemplateCatalog,
} from "@/api/creations";
import { getVideo } from "@/api/videos";
import type { Video } from "@/api/types";
import { Button } from "@/components/ui/button";
import CreatorPreview from "@/components/creator/CreatorPreview";
import CreatorPanel, { type SettingsPatch } from "@/components/creator/CreatorPanel";
import MomentStrip from "@/components/creator/MomentStrip";
import { apiErrorMessage, errorStatus } from "@/lib/errors";
import { formatClipTime } from "@/lib/clip-time";
import { momentsTotal } from "@/lib/creator";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRenderWatch } from "@/store/renders";
import "@/creator.css";

const SAVE_DELAY = 700;

function mergeDeep<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" ? mergeDeep(cur, v) : v;
  }
  return out as T;
}

interface Draft {
  name: string;
  moments: Moment[];
  settings: CreationSettings;
  captionEdits: Record<string, CaptionLine[]>;
}

export default function CreationEditor() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: creation, error, isLoading } = useQuery({ queryKey: ["creation", id], queryFn: () => getCreation(id) });
  const { data: catalog } = useQuery({ queryKey: ["templates"], queryFn: getTemplates, staleTime: 10 * 60_000 });

  if (error) {
    return (
      <div className="creator-missing">
        <h2>{errorStatus(error) === 404 ? "This creation doesn’t exist" : "We couldn’t open this creation"}</h2>
        <Button asChild className="studio-button" variant="outline">
          <Link to="/creations">
            <ArrowLeft /> Back to your creations
          </Link>
        </Button>
      </div>
    );
  }
  if (isLoading || !creation || !catalog) {
    return (
      <div className="creator-missing">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );
  }
  return <Editor key={creation.creation_id} creation={creation} catalog={catalog} onSaved={(c) => qc.setQueryData(["creation", id], c)} />;
}

function Editor({ creation, catalog, onSaved }: { creation: Creation; catalog: TemplateCatalog; onSaved: (c: Creation) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const recipe = creation.recipe;
  const [draft, setDraft] = useState<Draft>({
    name: creation.name,
    moments: creation.moments,
    settings: creation.settings,
    captionEdits: creation.caption_edits ?? {},
  });
  const [selected, setSelected] = useState<string | null>(creation.moments[0]?.id ?? null);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const pending = useRef<CreationPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inflight = useRef<Promise<void> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ---------------------------------------------------------------- saving
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setSaveState("saving");
    inflight.current = (async () => {
      try {
        const saved = await updateCreation(creation.creation_id, patch);
        onSaved(saved);
        // The server centres new or reshaped moments on their subject: take those crops.
        setDraft((d) => ({
          ...d,
          moments: d.moments.map((m) => {
            const s = saved.moments.find((x) => x.id === m.id);
            return s && !m.crop_locked && s.crop && JSON.stringify(s.crop) !== JSON.stringify(m.crop) && (!m.crop || patch.settings?.format)
              ? { ...m, crop: s.crop }
              : m;
          }),
        }));
        if (patch.moments || patch.caption_edits) qc.invalidateQueries({ queryKey: ["creation-captions", creation.creation_id] });
        setSaveState(Object.keys(pending.current).length ? "pending" : "saved");
      } catch (e) {
        pending.current = { ...patch, ...pending.current };
        setSaveState("error");
        toast.error(apiErrorMessage(e, "Your last change wasn’t saved."));
      } finally {
        inflight.current = null;
      }
    })();
    await inflight.current;
  }, [creation.creation_id, onSaved, qc]);

  const queue = useCallback(
    (patch: CreationPatch) => {
      const p = pending.current;
      pending.current = {
        ...p,
        ...patch,
        settings: patch.settings ? mergeDeep(p.settings ?? {}, patch.settings) : p.settings,
      };
      if (!pending.current.settings) delete pending.current.settings;
      setSaveState("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  const onSettings = (patch: SettingsPatch) => {
    setDraft((d) => ({ ...d, settings: mergeDeep(d.settings, patch) }));
    queue({ settings: patch as CreationPatch["settings"] });
  };
  const onMoments = (moments: Moment[]) => {
    setDraft((d) => ({ ...d, moments }));
    if (selected && !moments.some((m) => m.id === selected)) setSelected(moments[0]?.id ?? null);
    queue({ moments });
  };
  const onCrop = (momentId: string, crop: Crop) =>
    onMoments(draftRef.current.moments.map((m) => (m.id === momentId ? { ...m, crop, crop_locked: true } : m)));
  const onCaptionLines = (momentId: string, lines: CaptionLine[] | null) => {
    const edits = { ...draftRef.current.captionEdits };
    if (lines) edits[momentId] = lines;
    else delete edits[momentId];
    setDraft((d) => ({ ...d, captionEdits: edits }));
    queue({ caption_edits: edits });
  };

  // ---------------------------------------------------------------- data for the preview
  const videoIds = useMemo(() => [...new Set(draft.moments.map((m) => m.video_id))], [draft.moments]);
  const videoQueries = useQueries({
    queries: videoIds.map((vid) => ({ queryKey: ["video", vid], queryFn: () => getVideo(vid), staleTime: 30 * 60_000 })),
  });
  const videos: Record<string, Video | undefined> = {};
  videoIds.forEach((vid, i) => (videos[vid] = videoQueries[i]?.data));

  const { data: serverCaptions, isLoading: captionsLoading } = useQuery({
    queryKey: ["creation-captions", creation.creation_id],
    queryFn: () => getCaptions(creation.creation_id),
    enabled: draft.settings.captions.enabled,
  });
  const captionState = useMemo(() => {
    const out: Record<string, { edited: boolean; lines: CaptionLine[] }> = {};
    for (const m of draft.moments) {
      const edit = draft.captionEdits[m.id];
      const server = serverCaptions?.[m.id];
      out[m.id] = edit
        ? { edited: true, lines: edit }
        : { edited: false, lines: server && !server.edited ? server.lines : [] };
    }
    return out;
  }, [draft.moments, draft.captionEdits, serverCaptions]);
  const captionLines = useMemo(
    () => Object.fromEntries(Object.entries(captionState).map(([k, v]) => [k, v.lines])),
    [captionState],
  );

  const { data: logos } = useQuery({ queryKey: ["assets", "logo"], queryFn: () => listAssets("logo") });
  const { data: music } = useQuery({ queryKey: ["music"], queryFn: getMusic });
  const logoUrl = logos?.find((l) => l.asset_id === draft.settings.branding.logo_asset_id)?.url ?? null;
  const musicUrl =
    (draft.settings.music.track_id
      ? music?.library.find((t) => t.id === draft.settings.music.track_id)?.url
      : music?.uploads.find((a) => a.asset_id === draft.settings.music.asset_id)?.url) ?? null;

  // ---------------------------------------------------------------- rendering
  const { data: renders = [] } = useQuery({
    queryKey: ["renders", creation.creation_id],
    queryFn: () => listRenders(creation.creation_id),
    refetchInterval: (q) => (q.state.data?.some((r) => RENDER_ACTIVE.includes(r.status)) ? 2500 : false),
  });
  const active = renders.find((r) => RENDER_ACTIVE.includes(r.status));
  const prevActive = useRef<string | null>(null);
  useEffect(() => {
    const was = prevActive.current;
    prevActive.current = active?.render_id ?? null;
    if (was && !active) {
      void getRender(was).then((r) => {
        if (r.status === "ready") toast.success("Your video is ready to download.");
        else if (r.status === "failed") toast.error(r.error_message ?? "Rendering failed.");
      });
      qc.invalidateQueries({ queryKey: ["creations"] });
    }
  }, [active, qc]);

  const limits = catalog.limits;
  const [resolution, setResolution] = useState<720 | 1080>(
    Math.min(draft.settings.export.resolution, limits.max_resolution) as 720 | 1080,
  );
  const render = useMutation({
    mutationFn: async () => {
      await flush();
      return startRender(creation.creation_id, resolution);
    },
    onSuccess: (r) => {
      useRenderWatch.getState().watch({ renderId: r.render_id, creationId: creation.creation_id, name: draftRef.current.name });
      qc.setQueryData<Render[]>(["renders", creation.creation_id], (old) => [r, ...(old ?? [])]);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Rendering couldn’t start.")),
  });
  const removeRender = useMutation({
    mutationFn: deleteRender,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["renders", creation.creation_id] }),
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t delete that render.")),
  });

  const total = momentsTotal(draft.moments);
  const maxTotal = Math.min(recipe.moments.max_total_seconds, limits.max_creation_seconds);
  const blocker =
    draft.moments.length < recipe.moments.min
      ? `Add ${recipe.moments.min - draft.moments.length} more moment${recipe.moments.min - draft.moments.length === 1 ? "" : "s"}.`
      : total > maxTotal + 0.05
        ? `Trim ${Math.ceil(total - maxTotal)}s: this template allows ${maxTotal}s.`
        : recipe.moments.max_moment_seconds && draft.moments.some((m) => m.end - m.start > recipe.moments.max_moment_seconds! + 0.05)
          ? `Each moment can be up to ${recipe.moments.max_moment_seconds}s here.`
          : draft.moments.some((m) => videos[m.video_id] === undefined && videoQueries.some((q) => q.isError))
            ? "A video in this creation is no longer available."
            : null;

  const renderButton = (
    <Button className="studio-button" disabled={!!blocker || !!active || render.isPending} onClick={() => render.mutate()} title={blocker ?? undefined}>
      {active || render.isPending ? <Loader2 className="animate-spin" /> : <Clapperboard />}
      {active ? `${active.status === "queued" ? "Queued" : `Rendering ${active.progress}%`}` : "Render video"}
    </Button>
  );

  const exportPanel = (
    <div className="cp-export">
      <div className="cp-field">
        <div className="cp-field-label"><span>Quality</span></div>
        <div className="cp-chips">
          {([720, 1080] as const).map((r) => (
            <button key={r} className={cn("cp-chip", resolution === r && "active")} disabled={r > limits.max_resolution}
              onClick={() => { setResolution(r); onSettings({ export: { resolution: r } }); }}>
              {r}p{r > limits.max_resolution ? " · Pro" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-field">
        <div className="cp-field-label"><span>File name</span></div>
        <input className="cp-input" maxLength={120} value={draft.settings.export.file_name} placeholder={draft.name}
          onChange={(e) => onSettings({ export: { file_name: e.target.value } })} />
      </div>
      <ul className="cp-facts">
        <li>{formatClipTime(total)} long · {draft.settings.format}</li>
        <li>{limits.watermark ? "Includes a small “Made with FrameSeek” mark" : "No watermark"}</li>
        <li>{catalog.renders_used} of {limits.monthly_renders} renders used this month</li>
      </ul>
      {blocker && <p className="cp-callout is-warning"><AlertTriangle size={13} /> {blocker}</p>}
      {renderButton}
      <div className="cp-section-title">Renders</div>
      {!renders.length && <p className="cp-note">Rendered videos appear here, ready to download.</p>}
      <div className="cp-renders">
        {renders.map((r) => (
          <div key={r.render_id} className={cn("cp-render", `is-${r.status}`)}>
            {r.status === "ready" && r.video_url ? (
              <video src={r.video_url} poster={r.thumbnail_url ?? undefined} controls playsInline preload="none" />
            ) : null}
            <div className="cp-render-info">
              <span>
                {r.format} · {r.resolution}p
                {r.duration_seconds ? ` · ${formatClipTime(r.duration_seconds)}` : ""}
                {r.size_bytes ? ` · ${formatBytes(r.size_bytes)}` : ""}
              </span>
              <em>
                {RENDER_ACTIVE.includes(r.status)
                  ? r.status === "queued" ? "Waiting to start" : `${r.current_step ?? "Rendering"} · ${r.progress}%`
                  : r.status === "ready" ? new Date(r.completed_at ?? r.created_at).toLocaleString()
                    : r.error_message ?? "Didn’t finish"}
              </em>
              {RENDER_ACTIVE.includes(r.status) && (
                <div className="card-processing-bar"><span style={{ width: `${r.progress}%` }} /></div>
              )}
            </div>
            <div className="cp-render-actions">
              {r.status === "ready" && (
                <button className="icon-button" aria-label="Download video" onClick={() =>
                  downloadRender(r.render_id).catch((e) => toast.error(apiErrorMessage(e, "Download failed.")))}>
                  <Download size={13} />
                </button>
              )}
              {!RENDER_ACTIVE.includes(r.status) && (
                <button className="icon-button" aria-label="Delete render" onClick={() => removeRender.mutate(r.render_id)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const selectedMoment = draft.moments.find((m) => m.id === selected) ?? null;
  return (
    <div className="creator-editor">
      <div className="creator-top">
        <Link to={renders.some((r) => r.status === "ready") ? "/creations?tab=rendered" : "/creations"} className="icon-button" aria-label="Back to your creations">
          <ArrowLeft size={15} />
        </Link>
        <div className="creator-title">
          <input
            value={draft.name}
            maxLength={200}
            aria-label="Creation name"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            onBlur={() => draft.name.trim() && draft.name !== creation.name && queue({ name: draft.name.trim() })}
          />
          <p>
            {!renders.some((r) => r.status === "ready") && <span className="draft-chip">DRAFT</span>}
            {recipe.name.toUpperCase()} <span>/</span>
            <span className={cn("save-state", `is-${saveState}`)}>
              {saveState === "saved" ? <><Check size={9} /> SAVED</> : saveState === "error" ? "NOT SAVED" : "SAVING…"}
            </span>
          </p>
        </div>
        <div className="creator-top-actions">
          {blocker && !active && (
            <span className="render-blocker" role="status">
              <AlertTriangle size={12} /> {blocker}
            </span>
          )}
          <Button
            variant="outline"
            className="studio-button"
            disabled={saveState === "saving"}
            onClick={async () => {
              if (draft.name.trim() && draft.name !== creation.name) queue({ name: draft.name.trim() });
              await flush();
              if (!Object.keys(pending.current).length) {
                toast.success("Draft saved. Pick it up any time from Creations.", {
                  action: { label: "View drafts", onClick: () => navigate("/creations") },
                });
              }
            }}
          >
            <Save /> Save draft
          </Button>
          {renderButton}
        </div>
      </div>
      <div className="creator-grid">
        <div className="creator-main">
          <CreatorPreview
            recipe={recipe}
            settings={draft.settings}
            moments={draft.moments}
            captions={captionLines}
            captionStyle={catalog.caption_styles[draft.settings.captions.style]}
            videos={videos}
            logoUrl={logoUrl}
            musicUrl={musicUrl}
            watermark={limits.watermark}
            selectedMomentId={selected}
            onSelectMoment={setSelected}
            onCropChange={onCrop}
          />
          <MomentStrip
            recipe={recipe}
            moments={draft.moments}
            videos={videos}
            selectedId={selected}
            onSelect={setSelected}
            onChange={onMoments}
            maxCreationSeconds={limits.max_creation_seconds}
          />
        </div>
        <CreatorPanel
          recipe={recipe}
          catalog={catalog}
          settings={draft.settings}
          onSettings={onSettings}
          moments={draft.moments}
          onMoments={onMoments}
          videos={videos}
          selectedMoment={selectedMoment}
          captions={captionState}
          captionsLoading={captionsLoading && draft.settings.captions.enabled}
          onCaptionLines={onCaptionLines}
          exportPanel={exportPanel}
        />
      </div>
    </div>
  );
}
