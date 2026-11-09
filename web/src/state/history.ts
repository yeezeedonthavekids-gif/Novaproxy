import { signal, effect } from "@preact/signals";
import { load, save, remove } from "../lib/storage";
import { settings } from "./settings";
import { privateMode } from "./session";

export interface HistoryEntry {
  url: string;
  title: string;
  favicon: string;
  visitedAt: number;
  visits: number;
}

const MAX_ENTRIES = 2000;

function prune(list: HistoryEntry[]): HistoryEntry[] {
  const days = settings.peek().privacy.historyDays;
  const cutoff = days > 0 ? Date.now() - days * 86_400_000 : 0;
  return list.filter((e) => e.visitedAt >= cutoff).slice(0, MAX_ENTRIES);
}

export const history = signal<HistoryEntry[]>(prune(load<HistoryEntry[]>("history", [])));

/** Records a visit locally. Nothing is ever sent to a server. */
export function recordVisit(url: string, title: string, favicon: string) {
  if (privateMode.peek() || !settings.peek().privacy.saveHistory) return;
  if (!/^https?:/.test(url)) return;
  const list = history.peek();
  const existing = list.find((e) => e.url === url);
  const entry: HistoryEntry = {
    url,
    title: title || existing?.title || url,
    favicon: favicon || existing?.favicon || "",
    visitedAt: Date.now(),
    visits: (existing?.visits ?? 0) + 1,
  };
  history.value = prune([entry, ...list.filter((e) => e.url !== url)]);
}

export function updateVisitTitle(url: string, title: string, favicon: string) {
  const list = history.peek();
  const i = list.findIndex((e) => e.url === url);
  if (i < 0) return;
  const e = list[i]!;
  if (e.title === title && (!favicon || e.favicon === favicon)) return;
  const copy = [...list];
  copy[i] = { ...e, title: title || e.title, favicon: favicon || e.favicon };
  history.value = copy;
}

export function deleteHistoryEntry(url: string) {
  history.value = history.peek().filter((e) => e.url !== url);
}

export function clearHistory() {
  history.value = [];
  remove("history");
}

effect(() => {
  const list = history.value;
  if (!privateMode.value) save("history", list, 1000);
});
