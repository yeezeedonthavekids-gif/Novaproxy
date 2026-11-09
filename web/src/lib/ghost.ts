import { settings, type GhostDestination } from "../state/settings";
import { newTab, activeTab, navigate } from "../state/tabs";
import { isInternal } from "./url";

export function resolveDestination(d: GhostDestination): string {
  return d.url === "$homepage" ? settings.peek().homepage || "nova://home" : d.url;
}

/**
 * Opens a Ghost destination. "tab" opens it as a NOVA tab (proxied for web
 * addresses); "window" navigates this browser tab directly to the site,
 * leaving NOVA (useful for sites like Google Classroom that you want to use
 * with your normal browser session).
 */
export function goToDestination(d: GhostDestination) {
  const url = resolveDestination(d);
  const s = settings.peek();
  if (isInternal(url)) {
    const current = activeTab.peek();
    if (url === "nova://newtab" || url === "nova://home") {
      if (current.url === url) return;
      newTab(url);
    } else navigate(current.id, url);
    return;
  }
  if (s.ghost.openIn === "window") {
    location.assign(url);
    return;
  }
  newTab(url);
}
