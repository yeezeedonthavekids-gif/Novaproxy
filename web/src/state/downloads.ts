import { signal } from "@preact/signals";

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  received: number;
  status: "downloading" | "done" | "failed";
  objectUrl: string;
  startedAt: number;
}

/** Downloads intercepted by the Scramjet engine during this session (kept in memory only). */
export const downloads = signal<DownloadItem[]>([]);

export function clearDownloads() {
  for (const d of downloads.peek()) if (d.objectUrl) URL.revokeObjectURL(d.objectUrl);
  downloads.value = [];
}
