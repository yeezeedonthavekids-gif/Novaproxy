/**
 * Wisp connection monitor.
 *
 * Status comes from a real Wisp handshake: NOVA opens a WebSocket to the
 * server and waits for the protocol's initial CONTINUE packet. Nothing is
 * simulated. To stay light on low-end devices there is no constant polling:
 * checks run at startup, when the network comes back, when the tab becomes
 * visible after a while, after page loads (throttled), and with exponential
 * backoff while the server is unreachable.
 *
 * Multiple servers can be configured; the first healthy one is used, giving
 * automatic failover.
 */
import { signal, effect } from "@preact/signals";
import { settings } from "../state/settings";
import { defaultWispUrl, normalizeWispUrl, sameOriginHasWispServer, wispIsSameOriginGuess } from "./runtime-config";

export type WispState = "unknown" | "checking" | "online" | "offline";

export interface WispStatus {
  state: WispState;
  url: string;
  latency: number | null;
  checkedAt: number;
  error: string;
  failures: number;
  nextRetryAt: number | null;
  candidates: string[];
  /** No Wisp server is configured and this site (e.g. a static host) doesn't run one. */
  notConfigured: boolean;
}

export const wispStatus = signal<WispStatus>({
  state: "unknown",
  url: "",
  latency: null,
  checkedAt: 0,
  error: "",
  failures: 0,
  nextRetryAt: null,
  candidates: [],
  notConfigured: false,
});

export interface ProbeResult {
  ok: boolean;
  latency: number;
  error: string;
}

/** Performs a genuine Wisp handshake against `url`. */
export function probeWisp(url: string, timeoutMs = 8000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let ws: WebSocket | null = null;
    let done = false;
    const finish = (ok: boolean, error = "") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      resolve({ ok, latency: Math.round(performance.now() - start), error });
    };
    const timer = setTimeout(() => finish(false, "Timed out waiting for the server"), timeoutMs);
    try {
      ws = new WebSocket(url);
    } catch {
      finish(false, "Invalid Wisp address");
      return;
    }
    ws.binaryType = "arraybuffer";
    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return finish(false, "Server is not speaking the Wisp protocol");
      const bytes = new Uint8Array(event.data);
      // Wisp v1 handshake: CONTINUE (0x03) on stream 0 with a 4-byte buffer size.
      if (bytes[0] === 0x03 && bytes.length >= 9) finish(true);
      else finish(false, "Unexpected handshake: this does not look like a Wisp server");
    };
    ws.onerror = () => finish(false, "Could not reach the Wisp server");
    ws.onclose = (event) => {
      if (event.code === 4003) {
        return finish(false, `The server refused this website (${location.origin}). Add it to ALLOWED_ORIGINS on the server.`);
      }
      finish(false, event.code === 1006 ? "Connection refused, blocked, or the server is down" : `Connection closed (${event.code}${event.reason ? `: ${event.reason}` : ""})`);
    };
  });
}

/** The relay built into this deployment (shown as "Default", never by address). */
export const builtInWispUrl = signal("");

/** What the UI shows for a Wisp server: the deployment's own relay is never displayed by address. */
export function wispLabel(url: string): string {
  if (!url) return "—";
  if (url === builtInWispUrl.value) return "Default";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Servers in the order NOVA should try them: the selected one first, then (with failover) the rest. */
async function candidates(): Promise<string[]> {
  const p = settings.peek().proxy;
  const fallback = await defaultWispUrl();
  if (builtInWispUrl.peek() !== fallback) builtInWispUrl.value = fallback;
  const all = [...new Set([fallback, ...p.wispServers.map(normalizeWispUrl).filter(Boolean)])];
  const wanted = p.wispSelected === "default" ? fallback : normalizeWispUrl(p.wispSelected);
  const first = all.includes(wanted) ? wanted : fallback;
  return p.wispFailover ? [first, ...all.filter((u) => u !== first)] : [first];
}

const listeners = new Set<(url: string) => void>();
/** Called whenever the active Wisp server changes or recovers after an outage. */
export function onWispRecovered(fn: (url: string) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<WispStatus> | null = null;

export function checkWisp(): Promise<WispStatus> {
  inflight ??= (async () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const prev = wispStatus.peek();
    const list = await candidates();
    wispStatus.value = { ...prev, state: prev.state === "online" ? "online" : "checking", candidates: list };

    if (!navigator.onLine) {
      return setOffline(list, "Your device is offline");
    }
    const errors: string[] = [];
    for (const url of list) {
      const result = await probeWisp(url);
      if (result.ok) {
        const recovered = prev.state !== "online" || prev.url !== url;
        wispStatus.value = {
          state: "online",
          url,
          latency: result.latency,
          checkedAt: Date.now(),
          error: "",
          failures: 0,
          nextRetryAt: null,
          candidates: list,
          notConfigured: false,
        };
        if (recovered) listeners.forEach((fn) => fn(url));
        return wispStatus.peek();
      }
      errors.push(list.length > 1 ? `${wispLabel(url)}: ${result.error}` : result.error);
    }
    // Nothing configured and the guessed same-origin server doesn't exist: say so plainly
    // instead of retrying forever against a static host.
    if (list.length === 1 && list[0] === builtInWispUrl.peek() && (await wispIsSameOriginGuess()) && !(await sameOriginHasWispServer())) {
      return setOffline(list, NOT_CONFIGURED_MESSAGE, true);
    }
    return setOffline(list, errors.join(" · "));
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export const NOT_CONFIGURED_MESSAGE =
  "This site doesn't run a Wisp server. Static hosts like Netlify, Vercel, Cloudflare Pages and GitHub Pages can't; host the NOVA server elsewhere (Docker, Render, a VPS) and add its address.";

function setOffline(list: string[], error: string, notConfigured = false): WispStatus {
  const prev = wispStatus.peek();
  const failures = prev.failures + 1;
  // 2s, 4s, 8s ... capped at 60s. Without a configured server, retrying fast is pointless.
  const delay = notConfigured ? 120_000 : Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5));
  wispStatus.value = {
    state: "offline",
    url: prev.url || list[0] || "",
    latency: null,
    checkedAt: Date.now(),
    error,
    failures,
    nextRetryAt: Date.now() + delay,
    candidates: list,
    notConfigured,
  };
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    // Only keep retrying while someone can see the result.
    if (document.visibilityState === "visible") void checkWisp();
  }, delay);
  return wispStatus.peek();
}

let lastSoftCheck = 0;
/** Cheap, throttled check used after page loads to keep the status honest without polling. */
export function softCheck() {
  const now = Date.now();
  if (now - lastSoftCheck < 60_000 || now - wispStatus.peek().checkedAt < 60_000) return;
  lastSoftCheck = now;
  void checkWisp();
}

let started = false;
export function startWispMonitor() {
  if (started) return;
  started = true;
  void checkWisp();
  addEventListener("online", () => void checkWisp());
  addEventListener("offline", () => {
    void candidates().then((list) => setOffline(list, "Your device is offline"));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const s = wispStatus.peek();
    if (s.state === "offline" || Date.now() - s.checkedAt > 120_000) void checkWisp();
  });
  // Re-check when the configured servers change.
  let first = true;
  effect(() => {
    const p = settings.value.proxy;
    void [p.wispServers.join("|"), p.wispSelected, p.wispFailover];
    if (first) {
      first = false;
      return;
    }
    wispStatus.value = { ...wispStatus.peek(), failures: 0 };
    void checkWisp();
  });
}

/** The URL proxy transports should use right now. */
export async function activeWispUrl(): Promise<string> {
  const s = wispStatus.peek();
  if (s.state === "online" && s.url) return s.url;
  const checked = await checkWisp();
  return checked.url || (await candidates())[0]!;
}
