import { api } from "./client";

export interface Folder {
  id: string;
  name: string;
  video_count: number;
}

interface RawFolder {
  folder_id: string;
  name: string;
  video_count: number;
}

const mapFolder = (f: RawFolder): Folder => ({
  id: f.folder_id,
  name: f.name,
  video_count: f.video_count,
});

export async function listFolders(): Promise<Folder[]> {
  const { data } = await api.get<{ folders: RawFolder[] }>("/folders");
  return (data.folders ?? [])
    .map(mapFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(name: string): Promise<Folder> {
  const { data } = await api.post<RawFolder>("/folders", { name });
  return mapFolder(data);
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const { data } = await api.put<RawFolder>(`/folders/${id}`, { name });
  return mapFolder(data);
}

export async function deleteFolder(id: string): Promise<void> {
  await api.delete(`/folders/${id}`);
}
