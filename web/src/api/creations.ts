import { api } from "./client";

export type CreationFormat = "9:16" | "1:1" | "4:5" | "16:9";

export interface TextLayerRecipe {
  id: string;
  role: string;
  default_text: string;
  timing: {
    from?: string;
    duration?: number | "full" | "moment";
    per_moment?: boolean;
    between_moments?: boolean;
  };
  style: {
    font?: string;
    size?: string;
    position?: string;
    box?: string;
    background?: string;
    animation?: string;
    accent_bar?: string;
  };
}

export interface TemplateRecipe {
  id: string;
  version: number;
  name: string;
  audience: string[];
  category: "short" | "reel" | "brand";
  description: string;
  formats: CreationFormat[];
  default_format: CreationFormat;
  moments: { min: number; max: number; max_total_seconds: number; max_moment_seconds?: number };
  layout: {
    type: "fill" | "split" | "frame";
    reframe?: "subject" | "none";
    video_ratio?: number;
    panel_background?: string;
    background?: string;
    inset_margin?: number;
    corner_radius?: number;
  };
  captions: { enabled: boolean; style: string; position: string };
  text_layers: TextLayerRecipe[];
  branding: { logo: { position: string; opacity: number; default_enabled: boolean; required?: boolean } };
  transitions: { type: string; duration?: number };
  intro_card: { enabled: boolean; duration?: number; default_text?: string; background?: string } | null;
  outro_card: { enabled: boolean; duration?: number; default_text?: string; background?: string } | null;
  music: { default_mood: string; volume: number; leads: boolean };
  panel: string[];
}

export interface CaptionStyle {
  label: string;
  granularity: "word" | "sentence";
  font: string;
  case: "upper" | "as-is";
  size: string;
  color: string;
  active_word_color?: string;
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number };
  box?: { color: string; radius: number; padding: number };
  words_per_line?: number;
  max_lines?: number;
  quote_marks?: boolean;
  animation?: string;
}

export interface TemplateLimits {
  monthly_renders: number;
  max_creation_seconds: number;
  max_resolution: number;
  watermark: boolean;
  music_library: boolean;
  commercial_music: boolean;
  presets: boolean;
  priority: boolean;
}

export interface TemplateCatalog {
  templates: TemplateRecipe[];
  caption_styles: Record<string, CaptionStyle>;
  fonts: string[];
  limits: TemplateLimits;
  limits_enforced: boolean;
  renders_used: number;
}

export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

export interface Moment {
  id: string;
  video_id: string;
  start: number;
  end: number;
  crop: Crop | null;
  keep_audio: boolean;
  crop_locked?: boolean;
}

export interface TextLayerSettings {
  enabled: boolean;
  text: string;
  texts: string[];
  start: number | null;
  duration: number | null;
}

export interface CardSettings {
  enabled: boolean;
  text: string;
  duration: number;
}

export interface CreationSettings {
  format: CreationFormat;
  captions: {
    enabled: boolean;
    style: string;
    position: string;
    size: number;
    font: string | null;
    highlight_color: string | null;
  };
  text: Record<string, TextLayerSettings>;
  branding: {
    logo_asset_id: string | null;
    logo_enabled: boolean;
    logo_position: string;
    logo_size: number;
    logo_opacity: number;
    primary: string;
    accent: string;
    font: string | null;
  };
  intro: CardSettings;
  outro: CardSettings;
  transition: { type: "cut" | "crossfade" | "slide"; duration: number };
  /** "fit" shows the whole picture on a blurred copy of itself; "fill" crops to the frame. */
  framing?: "fit" | "fill";
  background: "blur" | "brand";
  music: {
    track_id: string | null;
    asset_id: string | null;
    volume: number;
    ducking: boolean;
    fade_in: number;
    fade_out: number;
    start_offset: number;
    original_audio_volume: number;
  };
  export: { resolution: 720 | 1080; file_name: string };
}

export interface CaptionLine {
  start: number;
  end: number;
  text: string;
}

export type RenderStatus = "queued" | "rendering" | "ready" | "failed" | "cancelled";

export interface Render {
  render_id: string;
  creation_id: string;
  status: RenderStatus;
  progress: number;
  current_step: string | null;
  format: CreationFormat;
  resolution: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  watermarked: boolean;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
}

export interface Creation {
  creation_id: string;
  name: string;
  template_id: string;
  template_version: number;
  recipe: TemplateRecipe;
  moments: Moment[];
  settings: CreationSettings;
  caption_edits: Record<string, CaptionLine[]>;
  created_at: string;
  updated_at: string;
  latest_render: Render | null;
  thumbnail_url: string | null;
}

export interface Asset {
  asset_id: string;
  kind: "logo" | "music";
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  url: string | null;
}

export const RENDER_ACTIVE: RenderStatus[] = ["queued", "rendering"];

export async function getTemplates() {
  const { data } = await api.get<TemplateCatalog>("/templates");
  return data;
}

export async function listCreations() {
  const { data } = await api.get<{ creations: Creation[] }>("/creations");
  return data.creations;
}

export async function getCreation(id: string) {
  const { data } = await api.get<Creation>(`/creations/${id}`);
  return data;
}

export async function createCreation(body: {
  template_id: string;
  format?: CreationFormat;
  name?: string;
  moments?: Omit<Moment, "crop" | "crop_locked">[];
}) {
  const { data } = await api.post<Creation>("/creations", body, { timeout: 60_000 });
  return data;
}

export interface CreationPatch {
  name?: string;
  moments?: Moment[];
  settings?: Partial<CreationSettings> | Record<string, unknown>;
  caption_edits?: Record<string, CaptionLine[]>;
}

export async function updateCreation(id: string, patch: CreationPatch) {
  const { data } = await api.patch<Creation>(`/creations/${id}`, patch, { timeout: 60_000 });
  return data;
}

export async function deleteCreation(id: string) {
  await api.delete(`/creations/${id}`);
}

export async function getCaptions(id: string) {
  const { data } = await api.get<{ captions: Record<string, { edited: boolean; lines: CaptionLine[] }> }>(
    `/creations/${id}/captions`,
  );
  return data.captions;
}

export async function listRenders(id: string) {
  const { data } = await api.get<{ renders: Render[] }>(`/creations/${id}/renders`);
  return data.renders;
}

export async function startRender(id: string, resolution?: number) {
  const { data } = await api.post<Render>(`/creations/${id}/render`, { resolution });
  return data;
}

export async function getRender(id: string) {
  const { data } = await api.get<Render>(`/renders/${id}`);
  return data;
}

export async function deleteRender(id: string) {
  await api.delete(`/renders/${id}`);
}

export async function downloadRender(id: string) {
  // Ask for a fresh signed link each time; saved links expire.
  const { data } = await api.get<{ download_url: string; filename: string }>(`/renders/${id}/download-url`);
  const link = document.createElement("a");
  link.href = data.download_url;
  link.download = data.filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function listAssets(kind: "logo" | "music") {
  const { data } = await api.get<{ assets: Asset[] }>("/assets", { params: { kind } });
  return data.assets;
}

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  mood: string;
  duration_seconds: number;
  licence: string;
  source_page: string;
  url: string;
}

export interface MusicCatalog {
  library_available: boolean;
  library_locked: boolean;
  moods: string[];
  licence_note: string;
  library: LibraryTrack[];
  uploads: Asset[];
}

export async function getMusic() {
  const { data } = await api.get<MusicCatalog>("/music");
  return data;
}

/** Upload a logo or music file straight to Blob storage, then confirm it. */
export async function uploadAsset(
  kind: "logo" | "music",
  file: File,
  rightsConfirmed = false,
  onProgress?: (fraction: number) => void,
): Promise<Asset> {
  const { data: target } = await api.post<{ asset_id: string; upload_url: string }>("/assets/upload-url", {
    kind,
    filename: file.name,
    size_bytes: file.size,
    content_type: file.type || "application/octet-stream",
    rights_confirmed: rightsConfirmed,
  });
  await api.put(target.upload_url, file, {
    baseURL: "",
    withCredentials: false,
    headers: { "Content-Type": file.type || "application/octet-stream", "x-ms-blob-type": "BlockBlob" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    },
  });
  const { data } = await api.post<Asset>(`/assets/${target.asset_id}/finalize`);
  return data;
}

export async function deleteAsset(id: string) {
  await api.delete(`/assets/${id}`);
}
