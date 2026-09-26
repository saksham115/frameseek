import { create } from "zustand";

interface ImportDialogState {
  open: boolean;
  /** Folder to preselect, e.g. when importing from inside a folder. */
  folderId: string | null;
  show: (folderId?: string | null) => void;
  hide: () => void;
}

/** The Import dialog is global: any Import button opens it, uploads outlive it. */
export const useImportDialog = create<ImportDialogState>((set) => ({
  open: false,
  folderId: null,
  show: (folderId = null) => set({ open: true, folderId }),
  hide: () => set({ open: false }),
}));
