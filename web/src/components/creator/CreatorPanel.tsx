import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Loader2, Music2, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAsset,
  getMusic,
  listAssets,
  uploadAsset,
  type CaptionLine,
  type CreationFormat,
  type CreationSettings,
  type Moment,
  type TemplateCatalog,
  type TemplateRecipe,
} from "@/api/creations";
import type { Video } from "@/api/types";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { FORMAT_LABELS } from "@/lib/creator";
import { formatClipTime } from "@/lib/clip-time";
import { apiErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type SettingsPatch = DeepPartial<CreationSettings>;

const TAB_LABELS: Record<string, string> = {
  moments: "Moments",
  format: "Format",
  captions: "Captions",
  text: "Text",
  branding: "Branding",
  music: "Music",
  export: "Export",
};

const POSITIONS: Record<string, string> = {
  top: "Top",
  middle: "Middle",
  "lower-middle": "Lower middle",
  bottom: "Bottom",
  "panel-center": "In the panel",
};

const LOGO_POSITIONS: Record<string, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
  "center-bottom": "Bottom centre",
  "frame-top-left": "Frame, top left",
  "panel-bottom-right": "Panel, bottom right",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="cp-field">
      <div className="cp-field-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="cp-toggle">
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function Range({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display?: string;
}) {
  return (
    <Field label={label} hint={display ?? String(value)}>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label} />
    </Field>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="cp-color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label} />
      <span>{label}</span>
      <code>{value}</code>
    </label>
  );
}

export interface PanelProps {
  recipe: TemplateRecipe;
  catalog: TemplateCatalog;
  settings: CreationSettings;
  onSettings: (patch: SettingsPatch) => void;
  moments: Moment[];
  onMoments: (moments: Moment[]) => void;
  videos: Record<string, Video | undefined>;
  selectedMoment: Moment | null;
  captions: Record<string, { edited: boolean; lines: CaptionLine[] }>;
  captionsLoading: boolean;
  onCaptionLines: (momentId: string, lines: CaptionLine[] | null) => void;
  exportPanel: ReactNode;
}

export default function CreatorPanel(props: PanelProps) {
  const tabs = ["moments", ...props.recipe.panel.filter((p) => p !== "moments")];
  const [tab, setTab] = useState(tabs[0]);
  return (
    <aside className="creator-panel" aria-label="Adjust your creation">
      <div className="cp-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={cn(tab === t && "active")} onClick={() => setTab(t)}>
            {TAB_LABELS[t] ?? t}
          </button>
        ))}
      </div>
      <div className="cp-body" role="tabpanel">
        {tab === "moments" && <MomentsTab {...props} />}
        {tab === "format" && <FormatTab {...props} />}
        {tab === "captions" && <CaptionsTab {...props} />}
        {tab === "text" && <TextTab {...props} />}
        {tab === "branding" && <BrandingTab {...props} />}
        {tab === "music" && <MusicTab {...props} />}
        {tab === "export" && props.exportPanel}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------- tabs

function MomentsTab({ recipe, moments, onMoments, selectedMoment, videos, settings, onSettings }: PanelProps) {
  const perMoment = recipe.text_layers.filter((l) => l.timing.per_moment);
  const m = selectedMoment;
  const patch = (change: Partial<Moment>) => m && onMoments(moments.map((x) => (x.id === m.id ? { ...x, ...change } : x)));
  if (!m) return <p className="cp-note">Add a moment below, then select it to adjust it here.</p>;
  const index = moments.findIndex((x) => x.id === m.id);
  return (
    <>
      <div className="cp-section-title">
        Moment {index + 1} · {videos[m.video_id]?.title ?? "Video"}
        <span>{formatClipTime(m.start)} to {formatClipTime(m.end)}</span>
      </div>
      {recipe.layout.reframe !== "none" || m.crop ? (
        <Field label="Framing" hint={m.crop_locked ? "Set by you" : "Follows the subject"}>
          <p className="cp-note">Drag the picture in the preview to choose what stays in frame.</p>
          <Range
            label="Zoom"
            value={m.crop?.zoom ?? 1}
            min={1}
            max={2.5}
            step={0.05}
            display={`${(m.crop?.zoom ?? 1).toFixed(2)}×`}
            onChange={(zoom) => patch({ crop: { x: m.crop?.x ?? 0.5, y: m.crop?.y ?? 0.5, zoom }, crop_locked: true })}
          />
          <button className="cp-link" onClick={() => patch({ crop: null, crop_locked: false })}>
            <Crosshair size={12} /> Re-centre on the subject
          </button>
        </Field>
      ) : (
        <p className="cp-note">This template shows the whole picture, which suits screen recordings.</p>
      )}
      <Toggle label="Original sound" checked={m.keep_audio} onChange={(keep_audio) => patch({ keep_audio })} />
      {perMoment.map((layer) => {
        const state = settings.text[layer.id];
        if (!state) return null;
        const texts = [...state.texts];
        return (
          <Field key={layer.id} label={roleLabel(layer.role)} hint="This moment">
            <input
              className="cp-input"
              maxLength={200}
              value={texts[index] ?? ""}
              placeholder={state.text.split("{n}").join(String(index + 1))}
              onChange={(e) => {
                const next = Array.from({ length: Math.max(texts.length, index + 1) }, (_, i) => texts[i] ?? "");
                next[index] = e.target.value;
                onSettings({ text: { [layer.id]: { texts: next } } });
              }}
            />
          </Field>
        );
      })}
    </>
  );
}

function FormatTab({ recipe, settings, onSettings }: PanelProps) {
  return (
    <>
      <Field label="Format">
        <div className="cp-chips">
          {recipe.formats.map((f) => (
            <button key={f} className={cn("cp-chip", settings.format === f && "active")} onClick={() => onSettings({ format: f as CreationFormat })}>
              {FORMAT_LABELS[f as CreationFormat]}
            </button>
          ))}
        </div>
      </Field>
      {(recipe.layout.type === "frame" || recipe.intro_card || recipe.outro_card) && (
        <Field label="Background" hint={recipe.layout.type === "frame" ? "Behind the video and cards" : "Behind the cards"}>
          <div className="cp-chips">
            {(["brand", "blur"] as const).map((b) => (
              <button key={b} className={cn("cp-chip", settings.background === b && "active")} onClick={() => onSettings({ background: b })}>
                {b === "brand" ? "Brand colour" : "Blurred video"}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Between moments">
        <div className="cp-chips">
          {(["cut", "crossfade", "slide"] as const).map((type) => (
            <button key={type} className={cn("cp-chip", settings.transition.type === type && "active")} onClick={() => onSettings({ transition: { type } })}>
              {type === "cut" ? "Cut" : type === "crossfade" ? "Crossfade" : "Slide"}
            </button>
          ))}
        </div>
      </Field>
      {settings.transition.type !== "cut" && (
        <Range label="Transition length" value={settings.transition.duration} min={0.1} max={1.5} step={0.05}
          display={`${settings.transition.duration.toFixed(2)}s`} onChange={(duration) => onSettings({ transition: { duration } })} />
      )}
    </>
  );
}

function CaptionsTab({ settings, onSettings, catalog, moments, videos, captions, captionsLoading, onCaptionLines }: PanelProps) {
  const c = settings.captions;
  return (
    <>
      <Toggle label="Captions" checked={c.enabled} onChange={(enabled) => onSettings({ captions: { enabled } })} />
      {c.enabled && (
        <>
          <Field label="Style">
            <div className="cp-styles">
              {Object.entries(catalog.caption_styles).map(([id, s]) => (
                <button key={id} className={cn("cp-style", c.style === id && "active", `is-${id}`)} onClick={() => onSettings({ captions: { style: id } })}>
                  <span>{s.case === "upper" ? "ABC" : "Abc"}</span>
                  {s.label}
                  {s.granularity === "word" && <em>word by word</em>}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Position">
            <select className="studio-select w-full" value={c.position} onChange={(e) => onSettings({ captions: { position: e.target.value } })}>
              {Object.entries(POSITIONS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Range label="Size" value={c.size} min={0.6} max={1.6} step={0.05} display={`${Math.round(c.size * 100)}%`}
            onChange={(size) => onSettings({ captions: { size } })} />
          <Field label="Font">
            <select className="studio-select w-full" value={c.font ?? ""} onChange={(e) => onSettings({ captions: { font: e.target.value || null } })}>
              <option value="">Style default</option>
              {catalog.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          {catalog.caption_styles[c.style]?.granularity === "word" && (
            <div className="cp-row">
              <Color label="Spoken word" value={c.highlight_color ?? (catalog.caption_styles[c.style]?.active_word_color === "brand.accent" ? settings.branding.accent : "#FFFFFF")}
                onChange={(highlight_color) => onSettings({ captions: { highlight_color } })} />
              {c.highlight_color && <button className="cp-link" onClick={() => onSettings({ captions: { highlight_color: null } })}>Reset</button>}
            </div>
          )}
          <div className="cp-section-title">Caption text<span>From your transcript. Fix any word before rendering.</span></div>
          {captionsLoading && <p className="cp-note"><Loader2 size={12} className="animate-spin inline" /> Loading transcript…</p>}
          {moments.map((m, i) => {
            const entry = captions[m.id];
            const lines = entry?.lines ?? [];
            return (
              <div key={m.id} className="cp-caption-moment">
                <div className="cp-caption-head">
                  <span>{i + 1}. {videos[m.video_id]?.title ?? "Video"}</span>
                  {entry?.edited && (
                    <button className="cp-link" onClick={() => onCaptionLines(m.id, null)}>
                      <RotateCcw size={11} /> Use transcript
                    </button>
                  )}
                </div>
                {!lines.length && !captionsLoading && <p className="cp-note">No speech found in this moment.</p>}
                {lines.map((line, j) => (
                  <div key={j} className="cp-caption-line">
                    <span>{formatClipTime(line.start - m.start)}</span>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={line.text}
                      aria-label={`Caption ${j + 1} of moment ${i + 1}`}
                      onChange={(e) => onCaptionLines(m.id, lines.map((l, k) => (k === j ? { ...l, text: e.target.value } : l)))}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

function roleLabel(role: string) {
  return ({ hook: "Hook", title: "Title", lower_third: "Lower third", bullet: "Callout", cta: "Call to action", step_badge: "Step title" } as Record<string, string>)[role] ?? "Text";
}

function TextTab({ recipe, settings, onSettings, moments }: PanelProps) {
  const layers = recipe.text_layers;
  return (
    <>
      {recipe.intro_card && (
        <CardFields label="Intro card" card={settings.intro} usesLayer={layers.some((l) => l.timing.from === "intro")}
          onChange={(intro) => onSettings({ intro })} />
      )}
      {layers.map((layer) => {
        const state = settings.text[layer.id];
        if (!state) return null;
        const timing = layer.timing;
        const where = timing.from === "intro" ? "On the intro card" : timing.from === "outro" ? "On the end card"
          : timing.between_moments ? "Cards between moments" : timing.per_moment ? "On each moment" : timing.duration === "full" ? "Whole video" : `First ${state.duration ?? timing.duration}s`;
        return (
          <div key={layer.id} className="cp-layer">
            <Toggle label={roleLabel(layer.role)} hint={where} checked={state.enabled}
              onChange={(enabled) => onSettings({ text: { [layer.id]: { enabled } } })} />
            {state.enabled && (
              <>
                <input className="cp-input" maxLength={200} value={state.text} aria-label={roleLabel(layer.role)}
                  onChange={(e) => onSettings({ text: { [layer.id]: { text: e.target.value } } })} />
                {(timing.per_moment || timing.between_moments) && (
                  <p className="cp-note">
                    {timing.per_moment
                      ? "Used for every moment unless you set one in the Moments tab. {n} becomes the moment number."
                      : `Shown between moments (${Math.max(0, moments.length - 1)} cards).`}
                  </p>
                )}
                {timing.between_moments &&
                  moments.slice(1).map((_, i) => (
                    <input key={i} className="cp-input" maxLength={200} placeholder={state.text} value={state.texts[i] ?? ""}
                      aria-label={`Card ${i + 1} text`}
                      onChange={(e) => {
                        const next = Array.from({ length: Math.max(state.texts.length, i + 1) }, (_, k) => state.texts[k] ?? "");
                        next[i] = e.target.value;
                        onSettings({ text: { [layer.id]: { texts: next } } });
                      }} />
                  ))}
                {typeof timing.duration === "number" && !timing.per_moment && !timing.between_moments && (
                  <Range label="On screen for" value={state.duration ?? timing.duration} min={1} max={15} step={0.5}
                    display={`${state.duration ?? timing.duration}s`} onChange={(duration) => onSettings({ text: { [layer.id]: { duration } } })} />
                )}
              </>
            )}
          </div>
        );
      })}
      {recipe.outro_card && (
        <CardFields label="End card" card={settings.outro} usesLayer={layers.some((l) => l.timing.from === "outro")}
          onChange={(outro) => onSettings({ outro })} />
      )}
    </>
  );
}

function CardFields({ label, card, usesLayer, onChange }: {
  label: string; card: CreationSettings["intro"]; usesLayer: boolean; onChange: (c: Partial<CreationSettings["intro"]>) => void;
}) {
  return (
    <div className="cp-layer">
      <Toggle label={label} checked={card.enabled} onChange={(enabled) => onChange({ enabled })} />
      {card.enabled && (
        <>
          {!usesLayer && (
            <input className="cp-input" maxLength={200} value={card.text} aria-label={`${label} text`} onChange={(e) => onChange({ text: e.target.value })} />
          )}
          <Range label="Length" value={card.duration} min={1} max={8} step={0.5} display={`${card.duration}s`} onChange={(duration) => onChange({ duration })} />
        </>
      )}
    </div>
  );
}

function useUpload(kind: "logo" | "music", onDone: (id: string) => void) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: ({ file, rights }: { file: File; rights: boolean }) => uploadAsset(kind, file, rights, setProgress),
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: ["assets", kind] });
      qc.invalidateQueries({ queryKey: ["music"] });
      onDone(asset.asset_id);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Upload failed.")),
    onSettled: () => setProgress(null),
  });
  return { ...mutation, progress };
}

function BrandingTab({ recipe, settings, onSettings, catalog }: PanelProps) {
  const b = settings.branding;
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data: logos } = useQuery({ queryKey: ["assets", "logo"], queryFn: () => listAssets("logo") });
  const upload = useUpload("logo", (id) => onSettings({ branding: { logo_asset_id: id, logo_enabled: true } }));
  const remove = useMutation({
    mutationFn: deleteAsset,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["assets", "logo"] });
      if (b.logo_asset_id === id) onSettings({ branding: { logo_asset_id: null } });
    },
  });
  const positions = Object.entries(LOGO_POSITIONS).filter(([p]) =>
    p.startsWith("frame") ? recipe.layout.type === "frame" : p.startsWith("panel") ? recipe.layout.type === "split" : true,
  );
  return (
    <>
      <Field label="Logo" hint={recipe.branding.logo.required ? "This template is built around one" : undefined}>
        <div className="cp-logos">
          {(logos ?? []).map((l) => (
            <div key={l.asset_id} className={cn("cp-logo", b.logo_asset_id === l.asset_id && "active")}>
              <button onClick={() => onSettings({ branding: { logo_asset_id: l.asset_id, logo_enabled: true } })} aria-label={`Use ${l.filename}`}>
                {l.url && <img src={l.url} alt="" />}
              </button>
              <button className="cp-logo-remove" aria-label={`Delete ${l.filename}`} onClick={() => remove.mutate(l.asset_id)}>
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          <button className="cp-logo cp-logo-add" onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span>{upload.progress != null ? `${Math.round(upload.progress * 100)}%` : "Upload"}</span>
          </button>
        </div>
        <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate({ file: f, rights: false });
            e.target.value = "";
          }} />
        <p className="cp-note">PNG with a transparent background works best. Up to 5 MB.</p>
      </Field>
      {b.logo_asset_id && (
        <>
          <Toggle label="Show logo" checked={b.logo_enabled} onChange={(logo_enabled) => onSettings({ branding: { logo_enabled } })} />
          <Field label="Logo position">
            <select className="studio-select w-full" value={b.logo_position} onChange={(e) => onSettings({ branding: { logo_position: e.target.value } })}>
              {positions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Range label="Logo size" value={b.logo_size} min={0.06} max={0.4} step={0.01} display={`${Math.round(b.logo_size * 100)}% wide`}
            onChange={(logo_size) => onSettings({ branding: { logo_size } })} />
          <Range label="Logo opacity" value={b.logo_opacity} min={0.1} max={1} step={0.05} display={`${Math.round(b.logo_opacity * 100)}%`}
            onChange={(logo_opacity) => onSettings({ branding: { logo_opacity } })} />
        </>
      )}
      <Field label="Colours">
        <Color label="Primary" value={b.primary} onChange={(primary) => onSettings({ branding: { primary } })} />
        <Color label="Accent" value={b.accent} onChange={(accent) => onSettings({ branding: { accent } })} />
      </Field>
      <Field label="Font for titles and cards">
        <select className="studio-select w-full" value={b.font ?? ""} onChange={(e) => onSettings({ branding: { font: e.target.value || null } })}>
          <option value="">Template default</option>
          {catalog.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
    </>
  );
}

function MusicTab({ settings, onSettings }: PanelProps) {
  const m = settings.music;
  const input = useRef<HTMLInputElement>(null);
  const [rights, setRights] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["music"], queryFn: getMusic });
  const upload = useUpload("music", (id) => onSettings({ music: { asset_id: id } }));
  const remove = useMutation({
    mutationFn: deleteAsset,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["music"] });
      if (m.asset_id === id) onSettings({ music: { asset_id: null } });
    },
  });
  return (
    <>
      {!data?.library_available && (
        <p className="cp-callout">
          <Music2 size={13} /> A licensed music library is on its way. For now, add tracks you have the rights to use.
        </p>
      )}
      <Field label="Track">
        <div className="cp-tracks">
          <button className={cn("cp-track", !m.asset_id && "active")} onClick={() => onSettings({ music: { asset_id: null } })}>
            No music
          </button>
          {(data?.uploads ?? []).map((a) => (
            <div key={a.asset_id} className={cn("cp-track", m.asset_id === a.asset_id && "active")}>
              <button onClick={() => onSettings({ music: { asset_id: a.asset_id } })}>{a.filename}</button>
              <button className="icon-button" aria-label={`Delete ${a.filename}`} onClick={() => remove.mutate(a.asset_id)}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </Field>
      <div className="cp-upload-music">
        <label className="cp-check">
          <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} />
          <span>I have the rights to use this music in my videos.</span>
        </label>
        <button className="cp-button" disabled={!rights || upload.isPending} onClick={() => input.current?.click()}>
          {upload.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {upload.progress != null ? `Uploading ${Math.round(upload.progress * 100)}%` : "Upload music"}
        </button>
        <input ref={input} type="file" hidden accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.wav,.m4a"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate({ file: f, rights: true });
            e.target.value = "";
          }} />
        <p className="cp-note">MP3, WAV or M4A up to 20 MB. Platforms can still flag tracks you don’t own.</p>
      </div>
      {m.asset_id && (
        <>
          <Range label="Music volume" value={m.volume} min={0} max={1} step={0.05} display={`${Math.round(m.volume * 100)}%`}
            onChange={(volume) => onSettings({ music: { volume } })} />
          <Toggle label="Lower music under speech" checked={m.ducking} onChange={(ducking) => onSettings({ music: { ducking } })} />
          <Range label="Fade in" value={m.fade_in} min={0} max={5} step={0.25} display={`${m.fade_in}s`} onChange={(fade_in) => onSettings({ music: { fade_in } })} />
          <Range label="Fade out" value={m.fade_out} min={0} max={5} step={0.25} display={`${m.fade_out}s`} onChange={(fade_out) => onSettings({ music: { fade_out } })} />
          <Range label="Start the track at" value={m.start_offset} min={0} max={180} step={1} display={formatClipTime(m.start_offset)}
            onChange={(start_offset) => onSettings({ music: { start_offset } })} />
        </>
      )}
      <Range label="Original sound" value={m.original_audio_volume} min={0} max={1} step={0.05}
        display={`${Math.round(m.original_audio_volume * 100)}%`} onChange={(original_audio_volume) => onSettings({ music: { original_audio_volume } })} />
    </>
  );
}
