import { signal } from "@preact/signals";
import {
  activeTab,
  activate,
  closeTab,
  cycleTab,
  navigate,
  newTab,
  reopenClosedTab,
  sendCommand,
  tabs,
} from "../state/tabs";
import { settings, updateSettings, type ActionId } from "../state/settings";
import { addBookmark, findByUrl, removeNode, ROOT_BAR } from "../state/bookmarks";
import { toast } from "../components/ui";
import { internalPage, isInternal, type InternalPage } from "./url";
import { goToDestination } from "./ghost";

export const ghostOpen = signal(false);
export const focusAddressRequest = signal(0);

/** Opens an internal page: reuse a tab already showing it, else replace a blank home tab, else open a new tab. */
export function openPage(page: InternalPage) {
  const url = `nova://${page}`;
  const existing = tabs.peek().find((t) => internalPage(t.url) === page);
  if (existing) return activate(existing.id);
  const current = activeTab.peek();
  const replaceable = ["home", "newtab"].includes(internalPage(current.url) ?? "");
  if (replaceable) navigate(current.id, url);
  else newTab(url);
}

export function toggleBookmark() {
  const tab = activeTab.peek();
  if (isInternal(tab.url)) {
    toast("Internal NOVA pages can't be bookmarked", { icon: "info" });
    return;
  }
  const existing = findByUrl(tab.url);
  if (existing) {
    removeNode(existing.id);
    toast("Bookmark removed", { icon: "trash" });
  } else {
    addBookmark(tab.title, tab.url, ROOT_BAR, tab.favicon.startsWith("data:") ? tab.favicon : "");
    toast("Added to bookmarks bar", { icon: "star" });
  }
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => toast("Fullscreen was blocked by the browser", { icon: "alert" }));
}

export const ACTIONS: Record<ActionId, () => void> = {
  ghost: () => {
    const g = settings.peek().ghost;
    if (g.mode === "immediate" && !ghostOpen.peek()) {
      const dest = g.destinations.find((d) => d.id === g.defaultId) ?? g.destinations[0];
      if (dest) return goToDestination(dest);
    }
    ghostOpen.value = !ghostOpen.peek();
  },
  newTab: () => newTab(),
  closeTab: () => closeTab(activeTab.peek().id),
  reopenTab: reopenClosedTab,
  nextTab: () => cycleTab(1),
  prevTab: () => cycleTab(-1),
  focusAddress: () => (focusAddressRequest.value = focusAddressRequest.peek() + 1),
  reload: () => sendCommand(activeTab.peek().id, "reload"),
  back: () => sendCommand(activeTab.peek().id, "back"),
  forward: () => sendCommand(activeTab.peek().id, "forward"),
  home: () => navigate(activeTab.peek().id, settings.peek().homepage || "nova://home"),
  bookmarkPage: toggleBookmark,
  toggleBookmarkBar: () => updateSettings((s) => (s.layout.showBookmarkBar = !s.layout.showBookmarkBar)),
  openGames: () => openPage("games"),
  openSettings: () => openPage("settings"),
  openBookmarks: () => openPage("bookmarks"),
  openHistory: () => openPage("history"),
  toggleFullscreen,
  toggleMinimal: () => {
    updateSettings((s) => (s.presentation.minimal = !s.presentation.minimal));
    toast(settings.peek().presentation.minimal ? "Minimal mode on: hover the top edge to show the toolbar" : "Minimal mode off", { icon: "layout" });
  },
};
