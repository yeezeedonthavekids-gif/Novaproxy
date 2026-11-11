import { signal, effect, computed } from "@preact/signals";
import { load, save } from "../lib/storage";

export type ThemeMode = "dark" | "light" | "system";
export type PerfMode = "efficiency" | "balanced" | "visual";
export type EngineId = "uv" | "scramjet";
export type TransportId = "epoxy" | "libcurl";
export type FontId = "system" | "humanist" | "geometric" | "mono" | "serif";
export type ToolbarButton = "back" | "forward" | "reload" | "home" | "bookmark" | "engine" | "status" | "games" | "downloads";
export type WidgetId = "clock" | "search" | "quicklinks" | "bookmarks" | "recent" | "notes" | "games" | "weather";
export type WidgetSize = "s" | "m" | "l";
export type ActionId =
  | "ghost"
  | "newTab"
  | "closeTab"
  | "reopenTab"
  | "nextTab"
  | "prevTab"
  | "focusAddress"
  | "reload"
  | "back"
  | "forward"
  | "home"
  | "bookmarkPage"
  | "toggleBookmarkBar"
  | "openGames"
  | "openSettings"
  | "openBookmarks"
  | "openHistory"
  | "toggleFullscreen"
  | "toggleMinimal";

export interface GhostDestination {
  id: string;
  label: string;
  /** A URL, a nova:// page, or "$homepage" for the configured homepage. */
  url: string;
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

export interface Settings {
  version: 1;
  homepage: string;
  appearance: {
    theme: ThemeMode;
    preset: string;
    accent: string;
    radius: number;
    font: FontId;
    glass: boolean;
    density: "compact" | "comfortable";
    wallpaper: { kind: "none" | "gradient" | "image"; gradient: string; dim: number; blur: number; rev?: number };
    customCss: string;
  };
  performance: { mode: PerfMode; tabSleepMinutes: number; autoDetected: boolean };
  layout: {
    showBookmarkBar: boolean;
    toolbar: { id: ToolbarButton; visible: boolean }[];
    home: "centered" | "dashboard" | "minimal";
    widgets: { id: WidgetId; enabled: boolean; size: WidgetSize }[];
    quickLinks: QuickLink[];
  };
  search: { engine: string; custom: { id: string; name: string; url: string }[] };
  proxy: {
    engine: EngineId;
    transport: TransportId;
    /** Extra Wisp servers the user added. The site's own default is always available too. */
    wispServers: string[];
    /** "default" or one of wispServers. */
    wispSelected: string;
    /** If the selected server is down, try the others. */
    wispFailover: boolean;
    autoEngine: boolean;
  };
  privacy: {
    saveHistory: boolean;
    historyDays: number;
    restoreTabs: boolean;
    startPrivate: boolean;
    clearSiteDataOnExit: boolean;
  };
  shortcuts: Record<ActionId, string>;
  ghost: {
    enabled: boolean;
    mode: "overlay" | "immediate";
    defaultId: string;
    openIn: "tab" | "window";
    allowInInputs: boolean;
    destinations: GhostDestination[];
  };
  presentation: {
    workspaceName: string;
    titleMode: "workspace" | "page" | "custom";
    customTitle: string;
    favicon: "default" | "mono" | "dot" | "custom";
    customFavicon: string;
    minimal: boolean;
    newTab: "dashboard" | "clean";
  };
  games: { isolation: "strict" | "compatible" };
  weather: { enabled: boolean; city: string; unit: "c" | "f" };
}

export const SEARCH_ENGINES: { id: string; name: string; url: string }[] = [
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { id: "brave", name: "Brave Search", url: "https://search.brave.com/search?q=%s" },
  { id: "startpage", name: "Startpage", url: "https://www.startpage.com/do/search?q=%s" },
  { id: "google", name: "Google", url: "https://www.google.com/search?q=%s" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=%s" },
  { id: "ecosia", name: "Ecosia", url: "https://www.ecosia.org/search?q=%s" },
];

export const GRADIENTS: Record<string, { name: string; dark: string; light: string }> = {
  aurora: {
    name: "Aurora",
    dark: "radial-gradient(1200px 600px at 10% -10%, #3b2a7a55, transparent 60%), radial-gradient(900px 600px at 100% 0%, #0f5f7a44, transparent 60%), radial-gradient(800px 500px at 50% 120%, #4a1f6a33, transparent 60%)",
    light: "radial-gradient(1200px 600px at 10% -10%, #c9c1ff88, transparent 60%), radial-gradient(900px 600px at 100% 0%, #b3ecff88, transparent 60%)",
  },
  ember: {
    name: "Ember",
    dark: "radial-gradient(1000px 600px at 0% 0%, #7a2e1d55, transparent 60%), radial-gradient(900px 600px at 100% 100%, #7a5a1d44, transparent 60%)",
    light: "radial-gradient(1000px 600px at 0% 0%, #ffd2c288, transparent 60%), radial-gradient(900px 600px at 100% 100%, #ffe9b888, transparent 60%)",
  },
  glacier: {
    name: "Glacier",
    dark: "radial-gradient(1100px 650px at 80% -10%, #1d5f7a55, transparent 60%), radial-gradient(900px 500px at 0% 100%, #1d3b7a44, transparent 60%)",
    light: "radial-gradient(1100px 650px at 80% -10%, #bff1ff, transparent 60%), radial-gradient(900px 500px at 0% 100%, #d6e4ff, transparent 60%)",
  },
  meadow: {
    name: "Meadow",
    dark: "radial-gradient(1000px 600px at 20% 0%, #1d7a4a44, transparent 60%), radial-gradient(900px 600px at 100% 100%, #1d6a7a33, transparent 60%)",
    light: "radial-gradient(1000px 600px at 20% 0%, #c8f5dc, transparent 60%), radial-gradient(900px 600px at 100% 100%, #c8eef5, transparent 60%)",
  },
  dusk: {
    name: "Dusk",
    dark: "linear-gradient(160deg, #1a1430 0%, #0b0d14 55%, #131a2a 100%)",
    light: "linear-gradient(160deg, #f1ecff 0%, #f7f8fb 55%, #eaf2ff 100%)",
  },
};

export interface Preset {
  id: string;
  name: string;
  apply: Partial<Settings["appearance"]> & { home?: Settings["layout"]["home"] };
}

export const PRESETS: Preset[] = [
  { id: "nova", name: "Nova", apply: { theme: "dark", accent: "#8b7bff", radius: 14, font: "system", wallpaper: { kind: "gradient", gradient: "aurora", dim: 0, blur: 0 } } },
  { id: "paper", name: "Paper", apply: { theme: "light", accent: "#3563e9", radius: 10, font: "humanist", wallpaper: { kind: "none", gradient: "aurora", dim: 0, blur: 0 } } },
  { id: "terminal", name: "Terminal", apply: { theme: "dark", accent: "#3ddc84", radius: 6, font: "mono", wallpaper: { kind: "none", gradient: "aurora", dim: 0, blur: 0 } } },
  { id: "ember", name: "Ember", apply: { theme: "dark", accent: "#ff7a59", radius: 16, font: "geometric", wallpaper: { kind: "gradient", gradient: "ember", dim: 0, blur: 0 } } },
  { id: "glacier", name: "Glacier", apply: { theme: "light", accent: "#0e9fb7", radius: 18, font: "geometric", wallpaper: { kind: "gradient", gradient: "glacier", dim: 0, blur: 0 } } },
  { id: "focus", name: "Focus", apply: { theme: "dark", accent: "#a5a8b8", radius: 8, font: "system", wallpaper: { kind: "none", gradient: "aurora", dim: 0, blur: 0 }, home: "minimal" } },
];

export const DEFAULT_SHORTCUTS: Record<ActionId, string> = {
  ghost: "Alt+G",
  newTab: "Alt+T",
  closeTab: "Alt+W",
  reopenTab: "Alt+Shift+T",
  nextTab: "Alt+]",
  prevTab: "Alt+[",
  focusAddress: "Alt+L",
  reload: "Alt+R",
  back: "Alt+ArrowLeft",
  forward: "Alt+ArrowRight",
  home: "Alt+Home",
  bookmarkPage: "Alt+B",
  toggleBookmarkBar: "Alt+Shift+B",
  openGames: "Alt+P",
  openSettings: "Alt+,",
  openBookmarks: "Alt+M",
  openHistory: "Alt+H",
  toggleFullscreen: "Alt+F",
  toggleMinimal: "Alt+Shift+M",
};

export const ACTION_LABELS: Record<ActionId, string> = {
  ghost: "Ghost quick navigation",
  newTab: "New tab",
  closeTab: "Close tab",
  reopenTab: "Reopen closed tab",
  nextTab: "Next tab",
  prevTab: "Previous tab",
  focusAddress: "Focus address bar",
  reload: "Reload page",
  back: "Back",
  forward: "Forward",
  home: "Go home",
  bookmarkPage: "Bookmark this page",
  toggleBookmarkBar: "Show/hide bookmark bar",
  openGames: "Open games",
  openSettings: "Open settings",
  openBookmarks: "Open bookmark manager",
  openHistory: "Open history",
  toggleFullscreen: "Toggle fullscreen",
  toggleMinimal: "Toggle minimal presentation",
};

/** Pick a sensible starting performance profile from what the browser reports. */
function detectPerfMode(): PerfMode {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 4;
  if (nav.connection?.saveData || memory <= 4 || cores <= 2) return "efficiency";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "efficiency";
  return "balanced";
}

export const SLEEP_DEFAULTS: Record<PerfMode, number> = { efficiency: 5, balanced: 20, visual: 60 };

function defaults(): Settings {
  const mode = detectPerfMode();
  return {
    version: 1,
    homepage: "nova://home",
    appearance: {
      theme: "dark",
      preset: "nova",
      accent: "#8b7bff",
      radius: 14,
      font: "system",
      glass: false,
      density: "comfortable",
      wallpaper: { kind: "gradient", gradient: "aurora", dim: 0, blur: 0 },
      customCss: "",
    },
    performance: { mode, tabSleepMinutes: SLEEP_DEFAULTS[mode], autoDetected: true },
    layout: {
      showBookmarkBar: true,
      toolbar: (["back", "forward", "reload", "home", "bookmark", "games", "downloads", "engine", "status"] as ToolbarButton[]).map(
        (id) => ({ id, visible: id !== "downloads" }),
      ),
      home: "centered",
      widgets: [
        { id: "clock", enabled: true, size: "m" },
        { id: "search", enabled: true, size: "l" },
        { id: "quicklinks", enabled: true, size: "l" },
        { id: "recent", enabled: true, size: "m" },
        { id: "games", enabled: true, size: "m" },
        { id: "notes", enabled: false, size: "m" },
        { id: "bookmarks", enabled: false, size: "m" },
        { id: "weather", enabled: false, size: "s" },
      ],
      quickLinks: [
        { id: "q1", label: "Wikipedia", url: "https://www.wikipedia.org" },
        { id: "q2", label: "YouTube", url: "https://www.youtube.com" },
        { id: "q3", label: "Reddit", url: "https://www.reddit.com" },
        { id: "q4", label: "GitHub", url: "https://github.com" },
        { id: "q5", label: "Classroom", url: "https://classroom.google.com" },
        { id: "q6", label: "Discord", url: "https://discord.com/app" },
      ],
    },
    search: { engine: "duckduckgo", custom: [] },
    proxy: { engine: "uv", transport: "epoxy", wispServers: [], wispSelected: "default", wispFailover: true, autoEngine: true },
    privacy: { saveHistory: true, historyDays: 30, restoreTabs: true, startPrivate: false, clearSiteDataOnExit: false },
    shortcuts: { ...DEFAULT_SHORTCUTS },
    ghost: {
      enabled: true,
      mode: "overlay",
      defaultId: "classroom",
      openIn: "tab",
      allowInInputs: false,
      destinations: [
        { id: "classroom", label: "Google Classroom", url: "https://classroom.google.com" },
        { id: "homepage", label: "My homepage", url: "$homepage" },
        { id: "newtab", label: "Fresh new tab", url: "nova://newtab" },
      ],
    },
    presentation: {
      workspaceName: "",
      titleMode: "page",
      customTitle: "",
      favicon: "default",
      customFavicon: "",
      minimal: false,
      newTab: "dashboard",
    },
    games: { isolation: "strict" },
    weather: { enabled: false, city: "", unit: "c" },
  };
}

type Plain = Record<string, unknown>;
function isPlain(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** Merge saved settings over defaults so new options appear after upgrades without losing user choices. */
function merge<T>(base: T, saved: unknown): T {
  if (!isPlain(base)) return saved === undefined || saved === null ? base : (saved as T);
  if (!isPlain(saved)) return base;
  const out: Plain = { ...base };
  for (const key of Object.keys(base)) {
    if (key in saved) {
      const b = (base as Plain)[key];
      const s = saved[key];
      out[key] = isPlain(b) ? merge(b, s) : typeof s === typeof b || b === null ? s : b;
    }
  }
  return out as T;
}

function hydrate(): Settings {
  const base = defaults();
  const saved = load<unknown>("settings", null);
  const merged = merge(base, saved);
  // Keep lists consistent if a newer NOVA added new toolbar buttons / widgets.
  for (const t of base.layout.toolbar) {
    if (!merged.layout.toolbar.some((x) => x.id === t.id)) merged.layout.toolbar.push(t);
  }
  merged.layout.toolbar = merged.layout.toolbar.filter((x) => base.layout.toolbar.some((t) => t.id === x.id));
  for (const w of base.layout.widgets) {
    if (!merged.layout.widgets.some((x) => x.id === w.id)) merged.layout.widgets.push(w);
  }
  merged.layout.widgets = merged.layout.widgets.filter((x) => base.layout.widgets.some((w) => w.id === x.id));
  merged.shortcuts = { ...DEFAULT_SHORTCUTS, ...merged.shortcuts };
  return merged;
}

export const settings = signal<Settings>(hydrate());

/** Immutable update helper: `update(s => { s.appearance.theme = "light" })`. */
export function updateSettings(mutator: (draft: Settings) => void) {
  const draft = structuredClone(settings.value);
  mutator(draft);
  settings.value = draft;
}

export function resetSettings() {
  settings.value = defaults();
}

export function exportSettings(): string {
  return JSON.stringify(settings.value, null, 2);
}

export function importSettings(json: string) {
  const parsed = JSON.parse(json);
  if (!isPlain(parsed)) throw new Error("Not a NOVA settings file");
  settings.value = merge(defaults(), parsed);
}

export function applyPreset(id: string) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  updateSettings((s) => {
    const { home, ...appearance } = preset.apply;
    Object.assign(s.appearance, appearance, { preset: id });
    if (home) s.layout.home = home;
  });
}

export function setPerfMode(mode: PerfMode) {
  updateSettings((s) => {
    s.performance.mode = mode;
    s.performance.tabSleepMinutes = SLEEP_DEFAULTS[mode];
    s.performance.autoDetected = false;
    if (mode === "efficiency") s.appearance.glass = false;
  });
}

export const searchTemplate = computed(() => {
  const s = settings.value.search;
  return (
    SEARCH_ENGINES.find((e) => e.id === s.engine)?.url ??
    s.custom.find((e) => e.id === s.engine)?.url ??
    SEARCH_ENGINES[0]!.url
  );
});

export const prefersLight = signal(matchMedia("(prefers-color-scheme: light)").matches);
matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => (prefersLight.value = e.matches));

export const effectiveTheme = computed(() => {
  const t = settings.value.appearance.theme;
  return t === "system" ? (prefersLight.value ? "light" : "dark") : t;
});

effect(() => save("settings", settings.value));
