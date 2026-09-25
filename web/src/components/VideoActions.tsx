import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FolderInput,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { listFolders } from "@/api/folders";
import { deleteVideo, moveVideo, reprocessVideo } from "@/api/videos";
import type { Video } from "@/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

/** Mutations shared by the library cards and the video workspace. */
export function useVideoMutations(video: Pick<Video, "id" | "title">) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["videos"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["video", video.id] });
  };
  const remove = useMutation({
    mutationFn: () => deleteVideo(video.id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["video", video.id] });
      refresh();
      useAuth.getState().loadSession();
      toast.success(`“${video.title}” was deleted.`);
    },
    onError: (e) =>
      toast.error(apiErrorMessage(e, "Couldn’t delete this video.")),
  });
  const reprocess = useMutation({
    mutationFn: () => reprocessVideo(video.id),
    onSuccess: () => {
      refresh();
      toast.success("Processing restarted.");
    },
    onError: (e) =>
      toast.error(apiErrorMessage(e, "Couldn’t restart processing.")),
  });
  const move = useMutation({
    mutationFn: (folder: { id: string | null; name: string }) =>
      moveVideo(video.id, folder.id),
    onSuccess: (_, folder) => {
      refresh();
      toast.success(
        folder.id ? `Moved to ${folder.name}.` : "Removed from its folder.",
      );
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t move this video.")),
  });
  return { remove, reprocess, move };
}

export function DeleteVideoDialog({
  open,
  onOpenChange,
  video,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: Pick<Video, "title" | "file_size_bytes">;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{video.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The video, its indexed frames, transcript, and exported clips are
            removed permanently
            {video.file_size_bytes
              ? `, freeing ${formatBytes(video.file_size_bytes)} of storage`
              : ""}
            . This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep video</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete video
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function VideoActionsMenu({
  video,
  className,
  onDeleted,
}: {
  video: Video;
  className?: string;
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { remove, reprocess, move } = useVideoMutations(video);
  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: listFolders,
  });
  const busy = remove.isPending || reprocess.isPending || move.isPending;
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn("icon-button video-actions-trigger", className)}
            aria-label={`More actions for ${video.title}`}
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="studio-menu">
          {video.status === "failed" && (
            <DropdownMenuItem onSelect={() => reprocess.mutate()}>
              <RotateCcw /> Retry processing
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput /> Move to folder
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="studio-menu">
              <DropdownMenuItem
                disabled={!video.folder_id}
                onSelect={() => move.mutate({ id: null, name: "" })}
              >
                {!video.folder_id ? <Check /> : <span className="w-4" />} No
                folder
              </DropdownMenuItem>
              {folders?.length ? <DropdownMenuSeparator /> : null}
              {folders?.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  disabled={video.folder_id === f.id}
                  onSelect={() => move.mutate({ id: f.id, name: f.name })}
                >
                  {video.folder_id === f.id ? (
                    <Check />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="truncate">{f.name}</span>
                </DropdownMenuItem>
              ))}
              {!folders?.length && (
                <p className="studio-menu-hint">
                  Create a folder from the library to organise videos.
                </p>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirming(true)}
          >
            <Trash2 /> Delete video
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteVideoDialog
        open={confirming}
        onOpenChange={setConfirming}
        video={video}
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onDeleted })}
      />
    </>
  );
}
