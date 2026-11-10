import { useEffect, useRef, useState } from "preact/hooks";
import { updateTab, newTab, navigate, sendCommand, type Tab } from "../state/tabs";
import { settings } from "../state/settings";
import { recordVisit, updateVisitTitle } from "../state/history";
import { findByUrl, updateNode } from "../state/bookmarks";
import { ENGINES, prepareEngine, decodeAny, ProxyUnavailableError } from "../proxy/index";
import { checkWisp, softCheck, wispStatus } from "../proxy/wisp";
import { attachShortcutsToFrame } from "../lib/shortcuts";
import { hostOf } from "../lib/url";
import { ErrorPage } from "./ErrorPage";
import { toast } from "./ui";
import { recordFailure, recordSuccess } from "../lib/engine-memory";
import { Icon } from "./Icon";

const IFRAME_ALLOW = "fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; gamepad";

/** Converts a same-origin (proxied) favicon into a tiny data URL so it survives reloads and needs no network later. */
function captureFavicon(src: string, win: Window): Promise<string> {
  return new Promise((resolve) => {
    // The image must be requested from inside the proxied frame: only documents controlled by
    // the engine's service worker get proxied subresources. The native src setter is used so the
    // engine's own hooks don't encode the (already proxied) URL a second time.
    let img: HTMLImageElement;
    try {
      img = win.document.createElement("img");
    } catch {
      return resolve("");
    }
    img.decoding = "async";
    const timer = setTimeout(() => resolve(""), 4000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        c.getContext("2d")!.drawImage(img, 0, 0, 32, 32);
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve("");
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve("");
    };
    Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!.set!.call(img, src);
  });
}

const idle = (fn: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200);

export function WebView({ tab, active }: { tab: Tab; active: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const nav = useRef<{ entries: string[]; index: number; pending: "back" | "forward" | null }>({ entries: [], index: -1, pending: null });
  const observer = useRef<MutationObserver | null>(null);
  const [slow, setSlow] = useState(false);
  /** When the current page load started (for Auto engine timing). */
  const loadStart = useRef(0);
  /** URL we already switched engines for automatically, so Auto never ping-pongs. */
  const autoSwitchedFor = useRef<string | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // Load (or reload) whenever NOVA initiates a navigation or the engine changes.
  useEffect(() => {
    if (tab.discarded) return;
    let cancelled = false;
    setSlow(false);
    (async () => {
      updateTab(tab.id, { loading: true, error: null });
      try {
        let status = wispStatus.peek();
        if (status.state !== "online") status = await checkWisp();
        if (cancelled) return;
        if (status.state !== "online") {
          throw new ProxyUnavailableError("NOVA can't reach its Wisp server.", "wisp", status.error);
        }
        await prepareEngine(tab.engine);
        if (cancelled || !frame.current) return;
        nav.current.pending = null;
        loadStart.current = performance.now();
        frame.current.src = ENGINES[tab.engine].encode(tab.url);
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof ProxyUnavailableError ? err : new ProxyUnavailableError("Something went wrong starting the proxy.", "engine", String(err));
        updateTab(tab.id, { loading: false, error: { kind: e.kind, message: e.message, detail: e.detail } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab.navToken, tab.engine, tab.discarded]);

  // Slow page: in Auto mode switch to the other engine once; otherwise offer it.
  useEffect(() => {
    if (!tab.loading || tab.error) return;
    const auto = settings.peek().proxy.autoEngine;
    const timer = setTimeout(
      () => {
        const t = tabRef.current;
        if (auto && autoSwitchedFor.current !== t.url && wispStatus.peek().state === "online") {
          autoSwitch(t, "was slow");
        } else setSlow(true);
      },
      auto ? 12_000 : 15_000,
    );
    return () => clearTimeout(timer);
  }, [tab.loading, tab.navToken, tab.error]);

  /** Retry the page with the other engine and remember that this one struggled with the site. */
  const autoSwitch = (t: Tab, why: string) => {
    const other = t.engine === "uv" ? "scramjet" : "uv";
    recordFailure(t.url, t.engine);
    autoSwitchedFor.current = t.url;
    toast(`${hostOf(t.url)} ${why} with ${ENGINES[t.engine].name}, trying ${ENGINES[other].name}`, { icon: "bolt" });
    navigate(t.id, t.url, other);
  };

  // Toolbar commands.
  useEffect(() => {
    const cmd = tab.command;
    const win = frame.current?.contentWindow;
    if (!cmd || !win) return;
    try {
      if (cmd.kind === "back") {
        nav.current.pending = "back";
        win.history.back();
      } else if (cmd.kind === "forward") {
        nav.current.pending = "forward";
        win.history.forward();
      } else if (cmd.kind === "reload") {
        updateTab(tab.id, { loading: true });
        win.location.reload();
      } else if (cmd.kind === "stop") {
        win.stop();
        updateTab(tab.id, { loading: false });
      }
    } catch {
      /* frame navigated somewhere we can't script */
    }
  }, [tab.command?.nonce]);

  useEffect(() => () => observer.current?.disconnect(), []);

  // A tab that failed only because the Wisp server was unreachable retries by itself once it's back.
  const wispOnline = wispStatus.value.state === "online";
  useEffect(() => {
    if (wispOnline && tab.error?.kind === "wisp" && !tab.discarded) sendCommand(tab.id, "reload");
  }, [wispOnline, tab.error?.kind]);

  const syncFromFrame = (fromLoad: boolean) => {
    const iframe = frame.current;
    const win = iframe?.contentWindow;
    if (!win) return;
    let href: string;
    let doc: Document;
    try {
      href = win.location.href;
      doc = win.document;
    } catch {
      return;
    }
    if (href === "about:blank") return;
    const real = decodeAny(href);
    const current = tabRef.current;
    if (!real) {
      // The page escaped the proxy prefix (rare). Bring it back under the proxy.
      if (fromLoad && /^https?:/.test(href) && !href.startsWith(location.origin)) navigate(current.id, href);
      return;
    }
    // The engine couldn't load the site and showed its own error page.
    const engineError = !!doc.getElementById("errorTrace") && !!(doc.getElementById("uvHostname") || doc.getElementById("fetchedURL"));
    if (fromLoad && engineError && wispStatus.peek().state === "online") {
      if (settings.peek().proxy.autoEngine && autoSwitchedFor.current !== real) {
        autoSwitch({ ...current, url: real }, "didn't load");
        return;
      }
      recordFailure(real, current.engine);
    } else if (fromLoad && !engineError && loadStart.current) {
      recordSuccess(real, current.engine, performance.now() - loadStart.current);
      loadStart.current = 0;
    }

    const title = (doc.title || "").trim() || hostOf(real) || real;
    const patch: Partial<Tab> = { url: real, title };

    if (fromLoad) {
      const n = nav.current;
      if (n.pending === "back") n.index = Math.max(0, n.index - 1);
      else if (n.pending === "forward") n.index = Math.min(n.entries.length - 1, n.index + 1);
      else if (n.entries[n.index] !== real) {
        if (n.entries[n.index - 1] === real) n.index--;
        else if (n.entries[n.index + 1] === real) n.index++;
        else {
          n.entries = [...n.entries.slice(0, n.index + 1), real].slice(-100);
          n.index = n.entries.length - 1;
        }
      }
      n.entries[n.index] = real;
      n.pending = null;
      Object.assign(patch, { loading: false, error: null, canBack: n.index > 0, canForward: n.index < n.entries.length - 1 });
      setSlow(false);
    } else {
      // In-page (SPA) navigation detected via title changes
      const n = nav.current;
      if (n.entries[n.index] !== real) {
        n.entries = [...n.entries.slice(0, n.index + 1), real].slice(-100);
        n.index = n.entries.length - 1;
        Object.assign(patch, { canBack: n.index > 0, canForward: false });
      }
    }
    updateTab(current.id, patch);

    if (fromLoad) recordVisit(real, title, current.url === real ? current.favicon : "");
    else updateVisitTitle(real, title, "");

    if (fromLoad) {
      const iconEl = doc.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
      const iconHref = iconEl?.href;
      idle(() => {
        // Engines hook element getters, so iconHref may be the site's real URL. Always load the
        // icon through the proxy: never contact the site directly, and keep it same-origin for the canvas.
        let target = "";
        try {
          target = iconHref ? new URL(iconHref, real).href : settings.peek().performance.mode !== "efficiency" ? new URL("/favicon.ico", real).href : "";
        } catch {
          target = "";
        }
        const src = !target ? "" : target.startsWith(location.origin) ? target : /^https?:/.test(target) ? ENGINES[current.engine].encode(target) : target.startsWith("data:") ? target : "";
        if (!src) return;
        const frameWin = frame.current?.contentWindow;
        if (!frameWin) return;
        void captureFavicon(src, frameWin).then((data) => {
          if (!data || tabRef.current.url !== real) return;
          updateTab(current.id, { favicon: data });
          updateVisitTitle(real, title, data);
          const bm = findByUrl(real);
          if (bm && !bm.icon) updateNode(bm.id, { icon: data });
        });
      });
    }
  };

  const onLoad = () => {
    const iframe = frame.current;
    const win = iframe?.contentWindow as (Window & { __novaHooked?: boolean }) | null;
    if (!win) return;
    syncFromFrame(true);
    softCheck();
    try {
      attachShortcutsToFrame(win);
      if (!win.__novaHooked) {
        win.__novaHooked = true;
        win.addEventListener("beforeunload", () => updateTab(tabRef.current.id, { loading: true }));
        win.addEventListener("popstate", () => syncFromFrame(false));
        win.addEventListener("hashchange", () => syncFromFrame(false));
        // Keep links that would open a new browser window inside NOVA instead.
        win.document.addEventListener(
          "click",
          (e) => {
            const a = (e.target as Element | null)?.closest?.("a[target]") as HTMLAnchorElement | null;
            if (!a || e.defaultPrevented || !["_blank", "_new"].includes(a.target.toLowerCase())) return;
            // Engines hook a.href to return the site's real URL; older paths may return the proxied one.
            const real = decodeAny(a.href) ?? (/^https?:/i.test(a.href) ? a.href : null);
            if (!real) return;
            e.preventDefault();
            newTab(real, { engine: tabRef.current.engine, background: e.ctrlKey || e.metaKey });
          },
          true,
        );
        const nativeOpen = win.open.bind(win);
        win.open = ((url?: string | URL, target?: string, features?: string) => {
          let real: string | null = null;
          if (url) {
            const abs = new URL(String(url), decodeAny(win.location.href) ?? win.location.href).href;
            real = decodeAny(abs) ?? (/^https?:/i.test(abs) ? abs : null);
          }
          if (real && !features && target !== "_self") {
            newTab(real, { engine: tabRef.current.engine });
            return null;
          }
          return nativeOpen(url, target, features);
        }) as typeof win.open;
      }
      observer.current?.disconnect();
      const head = win.document.head;
      if (head) {
        let scheduled = false;
        observer.current = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          setTimeout(() => {
            scheduled = false;
            syncFromFrame(false);
          }, 300);
        });
        observer.current.observe(head, { childList: true, subtree: true, characterData: true });
      }
    } catch {
      /* cross-origin content: nothing more to hook */
    }
  };

  if (tab.discarded) return null;
  const other = tab.engine === "uv" ? "scramjet" : "uv";

  return (
    <div class={`view web${tab.error ? " blank" : ""}`} data-active={String(active)}>
      {tab.loading && !tab.error && <div class="loadbar" />}
      {tab.error && <ErrorPage tab={tab} />}
      <iframe
        ref={frame}
        title={tab.title}
        allow={IFRAME_ALLOW}
        referrerpolicy="no-referrer"
        onLoad={onLoad}
        hidden={!!tab.error}
      />
      {slow && tab.loading && !tab.error && active && (
        <div class="page-hint" role="status">
          <Icon name="clock" size={15} />
          Taking a while to load.
          <button class="btn sm" onClick={() => navigate(tab.id, tab.url, other)}>
            Try {ENGINES[other].name}
          </button>
          <button class="icon-btn sm" aria-label="Dismiss" onClick={() => setSlow(false)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
