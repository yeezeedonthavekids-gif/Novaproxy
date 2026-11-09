/**
 * Runtime configuration from /nova.config.json. Static deployments can point
 * NOVA at a Wisp server or a different game mirror by editing that one file,
 * without rebuilding.
 */
export interface RuntimeConfig {
  wispUrl: string;
  gamesCatalogUrl: string;
  gamesHtmlBaseUrl: string;
  gamesCoverBaseUrl: string;
}

export const BASE = import.meta.env.BASE_URL;

const EMPTY: RuntimeConfig = { wispUrl: "", gamesCatalogUrl: "", gamesHtmlBaseUrl: "", gamesCoverBaseUrl: "" };
let cached: Promise<RuntimeConfig> | null = null;

export function runtimeConfig(): Promise<RuntimeConfig> {
  cached ??= (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(BASE + "nova.config.json", { cache: "no-cache", signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return EMPTY;
      const data = (await res.json()) as Partial<RuntimeConfig>;
      return { ...EMPTY, ...Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string")) };
    } catch {
      return EMPTY;
    }
  })();
  return cached;
}

/** Default Wisp endpoint: nova.config.json, then the build-time VITE_WISP_URL, then same origin. */
export async function defaultWispUrl(): Promise<string> {
  const cfg = await runtimeConfig();
  if (cfg.wispUrl) return normalizeWispUrl(cfg.wispUrl);
  const env = import.meta.env.VITE_WISP_URL as string | undefined;
  if (env) return normalizeWispUrl(env);
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/`;
}

/** Accepts wss://host/wisp/, https://host/wisp/ or just host and returns a proper wss:// URL. */
export function normalizeWispUrl(input: string): string {
  let s = input.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) s = s.replace(/^http/i, "ws");
  if (!/^wss?:\/\//i.test(s)) s = (location.protocol === "https:" ? "wss://" : "ws://") + s;
  try {
    const u = new URL(s);
    if (u.pathname === "/" || u.pathname === "") u.pathname = "/wisp/";
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    return u.href;
  } catch {
    return s;
  }
}
