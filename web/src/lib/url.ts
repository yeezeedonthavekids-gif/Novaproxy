/** Address bar input handling. */
export const INTERNAL_PAGES = [
  "home",
  "newtab",
  "games",
  "bookmarks",
  "history",
  "settings",
  "privacy",
  "diagnostics",
  "downloads",
  "shortcuts",
] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];

export function isInternal(url: string): boolean {
  return url.startsWith("nova://");
}

export function internalPage(url: string): InternalPage | null {
  if (!isInternal(url)) return null;
  const name = url.slice(7).split(/[/?#]/)[0] as InternalPage;
  return (INTERNAL_PAGES as readonly string[]).includes(name) ? name : null;
}

const TLD_LIKE = /^[^\s/?#]+\.[a-z]{2,}(?::\d+)?([/?#].*)?$/i;
const IP_LIKE = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?([/?#].*)?$/;
const LOCAL_LIKE = /^localhost(:\d+)?([/?#].*)?$/i;

/**
 * Turns whatever the user typed into a URL to load: an internal nova:// page,
 * a web address, or a search query on the chosen engine.
 */
export function resolveInput(input: string, searchTemplate: string): string {
  const text = input.trim();
  if (!text) return "nova://home";
  if (/^nova:\/\//i.test(text)) return text.toLowerCase();
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).href;
    } catch {
      /* fall through to search */
    }
  }
  if (!/\s/.test(text) && (TLD_LIKE.test(text) || IP_LIKE.test(text) || LOCAL_LIKE.test(text))) {
    try {
      return new URL("https://" + text).href;
    } catch {
      /* fall through */
    }
  }
  return searchUrl(text, searchTemplate);
}

export function searchUrl(query: string, template: string): string {
  return template.includes("%s")
    ? template.replace("%s", encodeURIComponent(query))
    : template + encodeURIComponent(query);
}

/** Short display form: "example.com/path" without protocol noise. */
export function displayUrl(url: string): string {
  if (isInternal(url)) return url;
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname) + u.search + u.hash;
  } catch {
    return url;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function safeHttpUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
