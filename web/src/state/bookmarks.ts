import { signal, effect, computed } from "@preact/signals";
import { load, save, uid } from "../lib/storage";

export interface BookmarkNode {
  id: string;
  type: "folder" | "link";
  title: string;
  url?: string;
  /** Emoji, data: URL or https URL. Empty = automatic letter icon. */
  icon?: string;
  children?: string[];
  createdAt: number;
}

export interface BookmarkTree {
  nodes: Record<string, BookmarkNode>;
}

export const ROOT_BAR = "bar";
export const ROOT_OTHER = "other";
export const ROOTS = [ROOT_BAR, ROOT_OTHER];

function emptyTree(): BookmarkTree {
  const now = Date.now();
  return {
    nodes: {
      [ROOT_BAR]: { id: ROOT_BAR, type: "folder", title: "Bookmarks bar", children: [], createdAt: now },
      [ROOT_OTHER]: { id: ROOT_OTHER, type: "folder", title: "Other bookmarks", children: [], createdAt: now },
    },
  };
}

function validate(tree: BookmarkTree | null): BookmarkTree {
  if (!tree?.nodes?.[ROOT_BAR] || !tree.nodes[ROOT_OTHER]) return emptyTree();
  return tree;
}

export const bookmarks = signal<BookmarkTree>(validate(load<BookmarkTree | null>("bookmarks", null)));
effect(() => save("bookmarks", bookmarks.value));

function mutate(fn: (nodes: Record<string, BookmarkNode>) => void) {
  const nodes: Record<string, BookmarkNode> = {};
  for (const [k, v] of Object.entries(bookmarks.peek().nodes)) nodes[k] = { ...v, children: v.children && [...v.children] };
  fn(nodes);
  bookmarks.value = { nodes };
}

export function parentOf(id: string, nodes = bookmarks.peek().nodes): string | null {
  for (const n of Object.values(nodes)) if (n.children?.includes(id)) return n.id;
  return null;
}

export function addBookmark(title: string, url: string, parentId = ROOT_BAR, icon = ""): string {
  const id = uid();
  mutate((nodes) => {
    nodes[id] = { id, type: "link", title: title || url, url, icon, createdAt: Date.now() };
    (nodes[parentId] ?? nodes[ROOT_BAR]!).children!.push(id);
  });
  return id;
}

export function addFolder(title: string, parentId = ROOT_BAR): string {
  const id = uid();
  mutate((nodes) => {
    nodes[id] = { id, type: "folder", title: title || "New folder", children: [], createdAt: Date.now() };
    (nodes[parentId] ?? nodes[ROOT_BAR]!).children!.push(id);
  });
  return id;
}

export function updateNode(id: string, patch: Partial<Pick<BookmarkNode, "title" | "url" | "icon">>) {
  mutate((nodes) => {
    if (nodes[id]) nodes[id] = { ...nodes[id]!, ...patch };
  });
}

export function removeNode(id: string) {
  if (ROOTS.includes(id)) return;
  mutate((nodes) => {
    const drop = (nid: string) => {
      nodes[nid]?.children?.forEach(drop);
      delete nodes[nid];
    };
    const parent = parentOf(id, nodes);
    if (parent) nodes[parent]!.children = nodes[parent]!.children!.filter((c) => c !== id);
    drop(id);
  });
}

function isDescendant(nodes: Record<string, BookmarkNode>, ancestor: string, id: string): boolean {
  if (ancestor === id) return true;
  return (nodes[ancestor]?.children ?? []).some((c) => isDescendant(nodes, c, id));
}

/** Move a node into `parentId` at `index` (end if omitted). Refuses to move a folder into itself. */
export function moveNode(id: string, parentId: string, index?: number) {
  if (ROOTS.includes(id)) return;
  mutate((nodes) => {
    const target = nodes[parentId];
    if (!target || target.type !== "folder" || isDescendant(nodes, id, parentId)) return;
    const from = parentOf(id, nodes);
    if (!from) return;
    const fromList = nodes[from]!.children!;
    const oldIndex = fromList.indexOf(id);
    fromList.splice(oldIndex, 1);
    const list = target.children!;
    let at = index ?? list.length;
    if (from === parentId && oldIndex < at) at--;
    list.splice(Math.max(0, Math.min(at, list.length)), 0, id);
  });
}

export function findByUrl(url: string): BookmarkNode | undefined {
  return Object.values(bookmarks.value.nodes).find((n) => n.type === "link" && n.url === url);
}

export const allLinks = computed(() => Object.values(bookmarks.value.nodes).filter((n) => n.type === "link"));

export function searchBookmarks(query: string): BookmarkNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allLinks.value.filter((n) => n.title.toLowerCase().includes(q) || n.url?.toLowerCase().includes(q));
}

// ---- Import / export ------------------------------------------------------

export function exportJson(): string {
  return JSON.stringify({ format: "nova-bookmarks", version: 1, ...bookmarks.peek() }, null, 2);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Netscape bookmark file format, importable by every major browser. */
export function exportHtml(): string {
  const { nodes } = bookmarks.peek();
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];
  const walk = (id: string, depth: number) => {
    const n = nodes[id];
    if (!n) return;
    const pad = "    ".repeat(depth);
    const date = Math.floor(n.createdAt / 1000);
    if (n.type === "folder") {
      const bar = id === ROOT_BAR ? ' PERSONAL_TOOLBAR_FOLDER="true"' : "";
      lines.push(`${pad}<DT><H3 ADD_DATE="${date}"${bar}>${escapeHtml(n.title)}</H3>`);
      lines.push(`${pad}<DL><p>`);
      n.children?.forEach((c) => walk(c, depth + 1));
      lines.push(`${pad}</DL><p>`);
    } else {
      const icon = n.icon?.startsWith("data:image") ? ` ICON="${escapeHtml(n.icon)}"` : "";
      lines.push(`${pad}<DT><A HREF="${escapeHtml(n.url ?? "")}" ADD_DATE="${date}"${icon}>${escapeHtml(n.title)}</A>`);
    }
  };
  ROOTS.forEach((r) => walk(r, 1));
  lines.push("</DL><p>");
  return lines.join("\n");
}

function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Imports a Netscape HTML or NOVA JSON bookmark file. Returns the number of links imported. */
export function importBookmarks(text: string): number {
  const trimmed = text.trim();
  let count = 0;
  if (trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed) as BookmarkTree & { format?: string };
    if (data.format !== "nova-bookmarks" || !data.nodes) throw new Error("Unrecognised bookmark JSON");
    const folder = addFolder(`Imported ${new Date().toLocaleDateString()}`, ROOT_OTHER);
    const copy = (srcId: string, parent: string) => {
      const n = data.nodes[srcId];
      if (!n) return;
      if (n.type === "folder") {
        const f = addFolder(n.title, parent);
        n.children?.forEach((c) => copy(c, f));
      } else {
        const url = safeUrl(n.url ?? null);
        if (url) {
          addBookmark(n.title, url, parent, n.icon ?? "");
          count++;
        }
      }
    };
    ROOTS.forEach((r) => data.nodes[r]?.children?.forEach((c) => copy(c, folder)));
    return count;
  }

  const doc = new DOMParser().parseFromString(text, "text/html");
  const rootDl = doc.querySelector("dl");
  if (!rootDl) throw new Error("No bookmarks found in this file");
  const folder = addFolder(`Imported ${new Date().toLocaleDateString()}`, ROOT_OTHER);
  const walk = (dl: Element, parent: string) => {
    for (const dt of Array.from(dl.children)) {
      if (dt.tagName !== "DT") continue;
      const h3 = dt.querySelector(":scope > h3");
      const a = dt.querySelector(":scope > a");
      if (h3) {
        const f = addFolder(h3.textContent || "Folder", parent);
        const sub = dt.querySelector(":scope > dl") ?? (dt.nextElementSibling?.tagName === "DL" ? dt.nextElementSibling : null);
        if (sub) walk(sub, f);
      } else if (a) {
        const url = safeUrl(a.getAttribute("href"));
        if (url) {
          const icon = a.getAttribute("icon") ?? "";
          addBookmark(a.textContent || url, url, parent, icon.startsWith("data:image") && icon.length < 20000 ? icon : "");
          count++;
        }
      }
    }
  };
  walk(rootDl, folder);
  return count;
}
