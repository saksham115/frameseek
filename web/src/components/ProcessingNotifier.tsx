import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getVideo } from "@/api/videos";
import { errorStatus } from "@/lib/errors";
import { navigateTo } from "@/lib/navigation";
import { useUploads } from "@/store/uploads";
import { useRenderWatch } from "@/store/renders";
import { getRender } from "@/api/creations";

const POLL_MS = 10_000;

/** Ask once for system notifications; must be called from a click. */
export function requestProcessingNotifications() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission();
}

export function canAskForNotifications() {
  return typeof Notification !== "undefined" && Notification.permission === "default";
}

function systemNotify(title: string, body: string, videoId: string, path = `/videos/${videoId}`) {
  // Only when the user is elsewhere; in-app toasts cover the visible tab.
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  const n = new Notification(title, { body, icon: "/icon-192.png", tag: `video-${videoId}` });
  n.onclick = () => {
    window.focus();
    navigateTo(path);
    n.close();
  };
}

/**
 * Follows videos uploaded in this session until processing finishes, then tells the user:
 * a toast with "Open", plus a system notification when the tab is in the background.
 */
export default function ProcessingNotifier() {
  const qc = useQueryClient();
  const uploads = useUploads((s) => s.items);
  const watching = useRef(new Set<string>());
  const settled = useRef(new Set<string>());

  useEffect(() => {
    for (const item of uploads) {
      if (item.status === "done" && item.videoId && !settled.current.has(item.videoId)) {
        watching.current.add(item.videoId);
      }
    }
  }, [uploads]);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      for (const id of [...watching.current]) {
        try {
          const video = await getVideo(id);
          if (video.status !== "completed" && video.status !== "failed") continue;
          watching.current.delete(id);
          settled.current.add(id);
          if (stopped) return;
          qc.invalidateQueries({ queryKey: ["videos"] });
          qc.invalidateQueries({ queryKey: ["video", id] });
          if (video.status === "completed") {
            toast.success(`“${video.title}” is ready to search.`, {
              action: { label: "Open", onClick: () => navigateTo(`/videos/${id}`) },
              duration: 10_000,
            });
            systemNotify("Your video is ready", `“${video.title}” is ready to search.`, id);
          } else {
            toast.error(`“${video.title}” couldn’t be processed.`, {
              description: "Open it to retry.",
              action: { label: "Open", onClick: () => navigateTo(`/videos/${id}`) },
              duration: 10_000,
            });
            systemNotify("Processing didn’t finish", `“${video.title}” needs attention.`, id);
          }
        } catch (e) {
          // Stop following a video that was deleted; keep trying through network blips.
          if (errorStatus(e) === 404) watching.current.delete(id);
        }
      }
    };
    const timer = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [qc]);

  // Renders started in this session: say when each one finishes, wherever the user is.
  // The editor shows its own progress, so stay quiet while it's open on that creation.
  useEffect(() => {
    const timer = setInterval(async () => {
      for (const item of useRenderWatch.getState().items) {
        try {
          const r = await getRender(item.renderId);
          if (r.status === "queued" || r.status === "rendering") continue;
          useRenderWatch.getState().unwatch(item.renderId);
          qc.invalidateQueries({ queryKey: ["creations"] });
          const path = `/create/${item.creationId}`;
          const inEditor = window.location.pathname === path && !document.hidden;
          if (r.status === "ready") {
            if (!inEditor)
              toast.success(`“${item.name}” is rendered and ready to download.`, {
                action: { label: "Open", onClick: () => navigateTo(path) },
                duration: 10_000,
              });
            systemNotify("Your video is ready", `“${item.name}” is ready to download.`, item.renderId, path);
          } else if (r.status === "failed") {
            if (!inEditor)
              toast.error(`“${item.name}” didn’t render.`, {
                description: r.error_message ?? undefined,
                action: { label: "Open", onClick: () => navigateTo(path) },
              });
            systemNotify("Rendering didn’t finish", `“${item.name}” needs attention.`, item.renderId, path);
          }
        } catch (e) {
          if (errorStatus(e) === 404) useRenderWatch.getState().unwatch(item.renderId);
        }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [qc]);

  return null;
}
