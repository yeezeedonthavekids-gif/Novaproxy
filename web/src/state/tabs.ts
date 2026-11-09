import { signal, computed, effect } from "@preact/signals";
import { load, save, uid } from "../lib/storage";
import { settings, type EngineId } from "./settings";
import { privateMode } from "./session";
import { isInternal, internalPage } from "../lib/url";

export interface TabError {
  kind: "wisp" | "engine" | "load";
  message: string;
  detail?: string;
}

export interface Tab {
  id: string;
  /** Logical address: nova://page or a real http(s) URL. */
  url: string;
  title: string;
  favicon: string;
  engine: EngineId;
  loading: boolean;
  error: TabError | null;
  /** Discarded tabs keep their URL but free the iframe (and its memory). */
  discarded: boolean;
  lastActive: number;
  /** Increments for every navigation NOVA initiates (address bar, links in NOVA UI, reload). */
  navToken: number;
  canBack: boolean;
  canForward: boolean;
  /** Navigation request for the web view: "back" | "forward" | "reload" with a nonce. */
  command: { kind: "back" | "forward" | "reload" | "stop"; nonce: number } | null;
  pinned: boolean;
}

interface Persisted {
  tabs: Pick<Tab, "id" | "url" | "title" | "favicon" | "engine" | "pinned">[];
  active: string;
}

const INTERNAL_TITLES: Record<string, string> = {
  home: "Home",
  newtab: "New Tab",
  games: "Games",
  bookmarks: "Bookmarks",
  history: "History",
  settings: "Settings",
  privacy: "Privacy",
  diagnostics: "Diagnostics",
  downloads: "Downloads",
  shortcuts: "Shortcuts",
};

export function titleFor(url: string): string {
  if (isInternal(url)) return INTERNAL_TITLES[url.slice(7).split(/[/?#]/)[0] ?? ""] ?? "NOVA";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function makeTab(url: string, engine?: EngineId): Tab {
  return {
    id: uid(),
    url,
    title: titleFor(url),
    favicon: "",
    engine: engine ?? settings.peek().proxy.engine,
    loading: !isInternal(url),
    error: null,
    // Restored web tabs start discarded so startup never loads every site at once.
    discarded: false,
    lastActive: Date.now(),
    navToken: 1,
    canBack: false,
    canForward: false,
    command: null,
    pinned: false,
  };
}

function restore(): { tabs: Tab[]; active: string } {
  const s = settings.peek();
  if (s.privacy.restoreTabs && !privateMode.peek()) {
    const saved = load<Persisted | null>("tabs", null);
    if (saved?.tabs?.length) {
      const tabs = saved.tabs.map((t) => ({
        ...makeTab(t.url, t.engine),
        id: t.id,
        title: t.title || titleFor(t.url),
        favicon: t.favicon || "",
        pinned: !!t.pinned,
        discarded: !isInternal(t.url),
        loading: false,
      }));
      const active = tabs.some((t) => t.id === saved.active) ? saved.active : tabs[0]!.id;
      const activeTab = tabs.find((t) => t.id === active)!;
      activeTab.discarded = false;
      activeTab.loading = !isInternal(activeTab.url);
      return { tabs, active };
    }
  }
  const first = makeTab(s.presentation.newTab === "clean" ? "nova://newtab" : s.homepage || "nova://home");
  return { tabs: [first], active: first.id };
}

const initial = restore();
export const tabs = signal<Tab[]>(initial.tabs);
export const activeId = signal<string>(initial.active);
export const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value) ?? tabs.value[0]!);

const closedStack: { url: string; engine: EngineId }[] = [];

export function updateTab(id: string, patch: Partial<Tab> | ((t: Tab) => Partial<Tab>)) {
  tabs.value = tabs.value.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t));
}

export function activate(id: string) {
  if (!tabs.peek().some((t) => t.id === id)) return;
  activeId.value = id;
  updateTab(id, (t) => ({
    lastActive: Date.now(),
    // Waking a discarded tab reloads it.
    ...(t.discarded ? { discarded: false, loading: !isInternal(t.url), navToken: t.navToken + 1 } : {}),
  }));
}

export function newTab(url?: string, opts: { background?: boolean; engine?: EngineId } = {}): string {
  const s = settings.peek();
  const target = url ?? (s.presentation.newTab === "clean" ? "nova://newtab" : "nova://home");
  const tab = makeTab(target, opts.engine);
  const list = [...tabs.peek()];
  const idx = list.findIndex((t) => t.id === activeId.peek());
  list.splice(idx + 1, 0, tab);
  tabs.value = list;
  if (!opts.background) activeId.value = tab.id;
  return tab.id;
}

export function closeTab(id: string) {
  const list = tabs.peek();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const closing = list[idx]!;
  closedStack.push({ url: closing.url, engine: closing.engine });
  if (closedStack.length > 25) closedStack.shift();
  const rest = list.filter((t) => t.id !== id);
  if (!rest.length) {
    const fresh = makeTab(settings.peek().homepage || "nova://home");
    tabs.value = [fresh];
    activeId.value = fresh.id;
    return;
  }
  tabs.value = rest;
  if (activeId.peek() === id) activate(rest[Math.min(idx, rest.length - 1)]!.id);
}

export function closeOtherTabs(id: string) {
  tabs.value = tabs.peek().filter((t) => t.id === id || t.pinned);
  activate(id);
}

export function reopenClosedTab() {
  const last = closedStack.pop();
  if (last) newTab(last.url, { engine: last.engine });
}

export function moveTab(fromId: string, toId: string) {
  const list = [...tabs.peek()];
  const from = list.findIndex((t) => t.id === fromId);
  const to = list.findIndex((t) => t.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved!);
  tabs.value = list;
}

export function cycleTab(delta: number) {
  const list = tabs.peek();
  const idx = list.findIndex((t) => t.id === activeId.peek());
  activate(list[(idx + delta + list.length) % list.length]!.id);
}

/** Navigate a tab to a new logical URL (from the address bar or NOVA UI). */
export function navigate(id: string, url: string, engine?: EngineId) {
  updateTab(id, (t) => ({
    url,
    title: titleFor(url),
    favicon: isInternal(url) ? "" : t.url === url ? t.favicon : "",
    // A tab showing a NOVA page isn't tied to a site yet, so it follows the current default engine.
    engine: engine ?? (isInternal(t.url) ? settings.peek().proxy.engine : t.engine),
    error: null,
    loading: !isInternal(url),
    discarded: false,
    navToken: t.navToken + 1,
    command: null,
    ...(isInternal(url) ? { canBack: false, canForward: false } : {}),
  }));
}

export function navigateActive(url: string) {
  navigate(activeId.peek(), url);
}

export function sendCommand(id: string, kind: "back" | "forward" | "reload" | "stop") {
  updateTab(id, (t) => {
    if (kind === "reload" && (t.error || t.discarded)) {
      return { error: null, discarded: false, loading: true, navToken: t.navToken + 1 };
    }
    return { command: { kind, nonce: Math.random() } };
  });
}

export function closedCount() {
  return closedStack.length;
}

// Tab sleeping: discard background web tabs that have been idle too long.
setInterval(() => {
  const minutes = settings.peek().performance.tabSleepMinutes;
  if (!minutes) return;
  const cutoff = Date.now() - minutes * 60_000;
  const list = tabs.peek();
  // Web tabs and the games launcher (which may hold a running game) can sleep.
  const sleepy = (t: Tab) =>
    t.id !== activeId.peek() && !t.discarded && !t.pinned && (!isInternal(t.url) || internalPage(t.url) === "games") && t.lastActive < cutoff;
  if (list.some(sleepy)) tabs.value = list.map((t) => (sleepy(t) ? { ...t, discarded: true, loading: false } : t));
}, 60_000);

// Track when a tab stops being active so sleeping is measured from then.
let lastActive = activeId.peek();
effect(() => {
  const id = activeId.value;
  if (id !== lastActive) {
    const prev = lastActive;
    lastActive = id;
    queueMicrotask(() => updateTab(prev, { lastActive: Date.now() }));
  }
});

effect(() => {
  const list = tabs.value;
  const active = activeId.value;
  if (privateMode.value || !settings.value.privacy.restoreTabs) return;
  const persisted: Persisted = {
    tabs: list.map(({ id, url, title, favicon, engine, pinned }) => ({
      id,
      url,
      title,
      favicon: favicon.startsWith("data:") && favicon.length <= 8192 ? favicon : "",
      engine,
      pinned,
    })),
    active,
  };
  save("tabs", persisted, 500);
});
