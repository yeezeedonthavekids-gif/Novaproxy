import { useRef } from "preact/hooks";
import { tabs, activeId, type Tab } from "../state/tabs";
import { settings } from "../state/settings";
import { internalPage, isInternal, type InternalPage } from "../lib/url";
import { WebView } from "./WebView";
import { ErrorBoundary } from "./ErrorBoundary";
import { lazyPage } from "./lazy";
import Home from "../pages/Home";

export interface PageProps {
  tab: Tab;
  active: boolean;
}

const PAGES: Record<Exclude<InternalPage, "home" | "newtab">, ReturnType<typeof lazyPage<PageProps>>> = {
  games: lazyPage("Games", () => import("../pages/Games")),
  bookmarks: lazyPage("Bookmarks", () => import("../pages/Bookmarks")),
  history: lazyPage("History", () => import("../pages/History")),
  settings: lazyPage("Settings", () => import("../pages/Settings")),
  privacy: lazyPage("Privacy dashboard", () => import("../pages/Privacy")),
  diagnostics: lazyPage("Diagnostics", () => import("../pages/Diagnostics")),
  downloads: lazyPage("Downloads", () => import("../pages/Downloads")),
  shortcuts: lazyPage("Shortcuts", () => import("../pages/Shortcuts")),
};

const PAGE_NAMES: Record<InternalPage, string> = {
  home: "Home",
  newtab: "New tab",
  games: "Games",
  bookmarks: "Bookmarks",
  history: "History",
  settings: "Settings",
  privacy: "Privacy dashboard",
  diagnostics: "Diagnostics",
  downloads: "Downloads",
  shortcuts: "Shortcuts",
};

function InternalView({ tab, active }: PageProps) {
  const page = internalPage(tab.url) ?? "home";
  const Page = page === "home" || page === "newtab" ? null : PAGES[page];
  return (
    <div class="view internal" data-active={String(active)}>
      <ErrorBoundary name={PAGE_NAMES[page]}>{Page ? <Page tab={tab} active={active} /> : <Home tab={tab} active={active} clean={page === "newtab" && settings.value.presentation.newTab === "clean"} />}</ErrorBoundary>
    </div>
  );
}

/**
 * Renders every tab's view. Views are kept in creation order (not tab-strip
 * order) because moving an <iframe> in the DOM would reload it.
 */
export function Content() {
  const order = useRef<string[]>([]);
  const list = tabs.value;
  const active = activeId.value;
  const ids = new Set(list.map((t) => t.id));
  order.current = order.current.filter((id) => ids.has(id));
  for (const t of list) if (!order.current.includes(t.id)) order.current.push(t.id);
  const byId = new Map(list.map((t) => [t.id, t]));
  const keepGames = settings.value.performance.mode !== "efficiency";

  return (
    <main class="content">
      {order.current.map((id) => {
        const tab = byId.get(id)!;
        const isActive = id === active;
        if (!isInternal(tab.url)) return <WebView key={id} tab={tab} active={isActive} />;
        // Internal pages unmount when hidden (they're cheap to re-render), except a
        // games tab outside Efficiency mode so a running game survives a quick tab switch.
        const keep = keepGames && internalPage(tab.url) === "games" && !tab.discarded;
        if (!isActive && !keep) return null;
        return <InternalView key={id} tab={tab} active={isActive} />;
      })}
    </main>
  );
}
