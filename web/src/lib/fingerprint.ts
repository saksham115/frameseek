// Quick content fingerprint for "you've already uploaded this" checks: SHA-256 of the
// first and last MB plus the size. Reads at most 2 MB, so it's instant even for 500 MB
// files, and renaming a file doesn't change it.
const CHUNK = 1024 * 1024;

export async function fileFingerprint(file: File): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const head = new Uint8Array(await file.slice(0, CHUNK).arrayBuffer());
    const tail =
      file.size > CHUNK
        ? new Uint8Array(await file.slice(Math.max(CHUNK, file.size - CHUNK)).arrayBuffer())
        : new Uint8Array(0);
    const size = new TextEncoder().encode(String(file.size));
    const data = new Uint8Array(head.length + tail.length + size.length);
    data.set(head, 0);
    data.set(tail, head.length);
    data.set(size, head.length + tail.length);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
