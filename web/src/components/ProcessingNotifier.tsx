import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getVideo } from "@/api/videos";
import { errorStatus } from "@/lib/errors";
import { navigateTo } from "@/lib/navigation";
import { useUploads } from "@/store/uploads";

const POLL_MS = 10_000;

/** Ask once for system notifications; must be called from a click. */
export function requestProcessingNotifications() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission();
}

export function canAskForNotifications() {
  return typeof Notification !== "undefined" && Notification.permission === "default";
}

function systemNotify(title: string, body: string, videoId: string) {
  // Only when the user is elsewhere; in-app toasts cover the visible tab.
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  const n = new Notification(title, { body, icon: "/icon-192.png", tag: `video-${videoId}` });
  n.onclick = () => {
    window.focus();
    navigateTo(`/videos/${videoId}`);
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

  return null;
}
