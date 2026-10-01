export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Human label for the processing job's current step. */
export function processingStepLabel(step: string | null | undefined): string | null {
  if (!step) return null;
  const indexing = step.match(/^indexing_frames:(\d+)\/(\d+)$/);
  if (indexing) {
    const n = (v: string) => Number(v).toLocaleString();
    return `Indexing frames ${n(indexing[1])} of ${n(indexing[2])}`;
  }
  return (
    {
      starting: "Starting up",
      extracting_frames: "Extracting frames",
      uploading_frames: "Saving frames",
      saving_frames: "Saving frames",
      transcribing_audio: "Transcribing audio",
      generating_embeddings: "Indexing frames",
      indexing_transcript: "Indexing the transcript",
      embedding_transcripts: "Indexing the transcript",
    } as Record<string, string>
  )[step] ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
