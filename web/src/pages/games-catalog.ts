/**
 * Game catalog for NOVA's gaming hub.
 *
 * Source: the gn-math project (https://github.com/gn-math). Its `html`
 * repository holds the game files and has no license file, so NOVA does not
 * copy or redistribute them. Instead it reads the project's own catalog
 * (`assets/zones.json`, which lists names, authors and covers) and loads each
 * game on demand from the project's repository via jsDelivr. Creators are
 * credited on every game. Deployments can point at their own mirror through
 * nova.config.json or VITE_GAMES_* variables.
 */
import { runtimeConfig } from "../proxy/runtime-config";

export interface Game {
  id: number;
  name: string;
  cover: string;
  url: string;
  author: string;
  authorLink: string;
  tags: string[];
  featured: boolean;
}

interface RawZone {
  id: number;
  name: string;
  cover: string;
  url: string;
  author?: string;
  authorLink?: string;
  special?: string[];
  featured?: boolean;
}

const DEFAULTS = {
  catalog: "https://cdn.jsdelivr.net/gh/gn-math/assets@main/zones.json",
  html: "https://cdn.jsdelivr.net/gh/gn-math/html@main",
  covers: "https://cdn.jsdelivr.net/gh/gn-math/covers@main",
};

export const CATEGORY_LABELS: Record<string, string> = {
  html5: "HTML5",
  port: "Ports",
  flash: "Flash",
  fnf: "Rhythm",
  emulator: "Emulators",
  tools: "Tools",
};

let catalogPromise: Promise<Game[]> | null = null;

async function sources() {
  const cfg = await runtimeConfig();
  const env = import.meta.env;
  return {
    catalog: cfg.gamesCatalogUrl || (env.VITE_GAMES_CATALOG_URL as string) || DEFAULTS.catalog,
    html: (cfg.gamesHtmlBaseUrl || (env.VITE_GAMES_HTML_URL as string) || DEFAULTS.html).replace(/\/$/, ""),
    covers: (cfg.gamesCoverBaseUrl || (env.VITE_GAMES_COVER_URL as string) || DEFAULTS.covers).replace(/\/$/, ""),
  };
}

export function loadCatalog(): Promise<Game[]> {
  catalogPromise ??= (async () => {
    const src = await sources();
    const res = await fetch(src.catalog, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`The game catalog responded with ${res.status}`);
    const raw = (await res.json()) as RawZone[];
    if (!Array.isArray(raw)) throw new Error("The game catalog has an unexpected format");
    return raw
      .filter((z) => typeof z.url === "string" && z.url.includes("{HTML_URL}") && z.id >= 0)
      .map((z) => {
        const tags = z.special?.length ? [...new Set(z.special.map((t) => (["nds", "psx", "gba", "nes", "n64", "dos"].includes(t) ? "emulator" : t)))] : ["html5"];
        return {
          id: z.id,
          name: z.name.trim(),
          cover: z.cover.replace("{COVER_URL}", src.covers).replace("{HTML_URL}", src.html),
          url: z.url.replace("{HTML_URL}", src.html).replace("{COVER_URL}", src.covers),
          author: z.author ?? "",
          authorLink: z.authorLink ?? "",
          tags: tags.filter((t) => t in CATEGORY_LABELS),
          featured: !!z.featured,
        };
      });
  })().catch((err) => {
    catalogPromise = null;
    throw err;
  });
  return catalogPromise;
}

const htmlCache = new Map<string, string>();

/** Fetches a game's HTML (kept for the last 3 games only, to bound memory). */
export async function loadGameHtml(game: Game): Promise<string> {
  const cached = htmlCache.get(game.url);
  if (cached) return cached;
  const res = await fetch(game.url, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`The game file responded with ${res.status}`);
  const html = prepareGameHtml(await res.text(), game.url);
  htmlCache.set(game.url, html);
  while (htmlCache.size > 3) htmlCache.delete(htmlCache.keys().next().value!);
  return html;
}

const TRACKERS = /<script\b[^>]*\bsrc\s*=\s*["']?[^"'>]*(googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net)[^>]*>\s*<\/script>/gi;

/**
 * Prepares a game's HTML for the player:
 *  - strips third-party analytics/ad scripts (NOVA does not allow tracking)
 *  - adds a <base> pointing at the game's original location, unless the game
 *    already declares its own (the first <base> in a document wins).
 */
export function prepareGameHtml(html: string, url: string): string {
  let out = html.replace(TRACKERS, "<!-- tracker removed by NOVA -->");
  if (!/<base\s[^>]*href/i.test(out)) {
    const base = `<base href="${url.slice(0, url.lastIndexOf("/") + 1)}">`;
    out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + base) : base + out;
  }
  return out;
}
