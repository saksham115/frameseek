import { create } from "zustand";
import { toast } from "sonner";
import {
  createUploadTarget,
  deleteVideo,
  finalizeUpload,
  uploadToBlob,
} from "@/api/videos";
import { apiErrorMessage, errorStatus, isAbort } from "@/lib/errors";
import { navigateTo } from "@/lib/navigation";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/store/auth";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "finalizing"
  | "done"
  | "failed"
  | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  folderId: string | null;
  status: UploadStatus;
  progress: number;
  videoId?: string;
  error?: string;
}

const CONCURRENCY = 2;
const ACTIVE: UploadStatus[] = ["queued", "uploading", "finalizing"];
// Abort handles live outside the store so state stays serialisable.
const controllers = new Map<string, AbortController>();

interface UploadState {
  items: UploadItem[];
  enqueue: (files: File[], folderId: string | null) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
}

export const isActiveUpload = (item: UploadItem) => ACTIVE.includes(item.status);

/** Bytes already committed to uploads that haven't reached the server-side quota yet. */
export const pendingUploadBytes = (items: UploadItem[]) =>
  items.filter(isActiveUpload).reduce((sum, i) => sum + i.file.size, 0);

export const useUploads = create<UploadState>((set, get) => {
  const patch = (id: string, changes: Partial<UploadItem>) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    }));

  // A video row is created before the bytes arrive; drop it if the upload never completes
  // so abandoned uploads don't linger in the library.
  const discardVideo = (videoId?: string) => {
    if (videoId) deleteVideo(videoId).catch(() => undefined);
  };

  const describeFailure = (error: unknown, stage: UploadStatus) => {
    const status = errorStatus(error);
    if (status === 413) {
      return apiErrorMessage(error, "Not enough storage for this video.");
    }
    if (stage === "uploading" && !status) {
      return "The connection dropped during upload. Retry when you’re back online.";
    }
    if (status === 503) return "Uploads are briefly unavailable. Try again in a minute.";
    return apiErrorMessage(error, "Upload failed.");
  };

  const run = async (id: string) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const controller = new AbortController();
    controllers.set(id, controller);
    let stage: UploadStatus = "uploading";
    let videoId: string | undefined;
    patch(id, { status: "uploading", progress: 0, error: undefined });
    try {
      const target = await createUploadTarget(
        item.file.name,
        item.file.size,
        item.file.type,
        item.folderId,
      );
      videoId = target.video_id;
      patch(id, { videoId });
      if (controller.signal.aborted) throw new DOMException("", "AbortError");
      await uploadToBlob(
        target.upload_url,
        item.file,
        (frac) => patch(id, { progress: Math.min(99, Math.round(frac * 100)) }),
        controller.signal,
      );
      stage = "finalizing";
      patch(id, { status: "finalizing", progress: 100 });
      await finalizeUpload(videoId, controller.signal);
      patch(id, { status: "done" });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      useAuth.getState().loadSession();
      const doneId = videoId;
      toast.success(`“${item.file.name}” is in. We’re preparing it now.`, {
        action: { label: "Open", onClick: () => navigateTo(`/videos/${doneId}`) },
      });
    } catch (error) {
      discardVideo(videoId);
      if (isAbort(error) || controller.signal.aborted) {
        patch(id, { status: "cancelled", videoId: undefined });
      } else {
        const message = describeFailure(error, stage);
        patch(id, { status: "failed", error: message, videoId: undefined });
        toast.error(`“${item.file.name}” didn’t upload. ${message}`);
      }
    } finally {
      controllers.delete(id);
      pump();
    }
  };

  const pump = () => {
    const { items } = get();
    const running = items.filter(
      (i) => i.status === "uploading" || i.status === "finalizing",
    ).length;
    items
      .filter((i) => i.status === "queued")
      .slice(0, Math.max(0, CONCURRENCY - running))
      .forEach((i) => {
        // Mark synchronously so a second pump() in the same tick doesn't double-start it.
        patch(i.id, { status: "uploading" });
        void run(i.id);
      });
  };

  return {
    items: [],
    enqueue: (files, folderId) => {
      set((s) => ({
        items: [
          ...s.items,
          ...files.map((file) => ({
            id: crypto.randomUUID(),
            file,
            folderId,
            status: "queued" as const,
            progress: 0,
          })),
        ],
      }));
      pump();
    },
    cancel: (id) => {
      const item = get().items.find((i) => i.id === id);
      if (!item || !isActiveUpload(item)) return;
      const controller = controllers.get(id);
      if (controller) controller.abort();
      else patch(id, { status: "cancelled" });
    },
    retry: (id) => {
      patch(id, { status: "queued", progress: 0, error: undefined });
      pump();
    },
    dismiss: (id) =>
      set((s) => ({ items: s.items.filter((i) => i.id !== id || isActiveUpload(i)) })),
    clearFinished: () => set((s) => ({ items: s.items.filter(isActiveUpload) })),
  };
});
