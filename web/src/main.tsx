import { render } from "preact";
import { effect } from "@preact/signals";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/pages.css";
import { App } from "./components/App";
import { installShortcuts } from "./lib/shortcuts";
import { startWispMonitor } from "./proxy/wisp";
import { privateMode } from "./state/session";
import { settings, searchTemplate } from "./state/settings";
import { activeTab, navigate } from "./state/tabs";
import { clearProxiedSiteData } from "./lib/sitedata";
import { resolveInput } from "./lib/url";
import { flush } from "./lib/storage";

const PENDING_CLEAR = "nova:pending-clear";

// A previous private session that couldn't finish cleaning up (e.g. the browser was killed).
if (localStorage.getItem(PENDING_CLEAR)) {
  localStorage.removeItem(PENDING_CLEAR);
  void clearProxiedSiteData();
}

render(<App />, document.getElementById("app")!);
installShortcuts();

// Open a URL passed as ?url= or ?q= (e.g. from a browser search-engine shortcut).
const params = new URLSearchParams(location.search);
const incoming = params.get("url") ?? params.get("q");
if (incoming) {
  navigate(activeTab.peek().id, resolveInput(incoming, searchTemplate.peek()));
  history.replaceState(null, "", location.pathname);
}

// Private session bookkeeping.
let wasPrivate = privateMode.peek();
effect(() => {
  const now = privateMode.value;
  if (now) localStorage.setItem(PENDING_CLEAR, "1");
  else if (wasPrivate) {
    localStorage.removeItem(PENDING_CLEAR);
    void clearProxiedSiteData();
  }
  wasPrivate = now;
});

addEventListener("pagehide", () => {
  flush();
  if (privateMode.peek() || settings.peek().privacy.clearSiteDataOnExit) {
    localStorage.setItem(PENDING_CLEAR, "1");
    void clearProxiedSiteData().then(() => localStorage.removeItem(PENDING_CLEAR));
  }
});

// The connection indicator starts once the UI is idle, never blocking first paint.
const startIdle = () => startWispMonitor();
if ("requestIdleCallback" in window) requestIdleCallback(startIdle, { timeout: 3000 });
else setTimeout(startIdle, 1000);
