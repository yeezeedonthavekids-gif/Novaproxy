/**
 * Unified proxy interface.
 *
 * Each engine (Ultraviolet, Scramjet) implements the same small contract:
 * prepare it, turn a real URL into a proxied one, and turn a proxied URL back
 * into the real one. Engines are loaded only when first used, and each one has
 * its own service worker scope so an unused engine costs nothing. Adding a new
 * engine means implementing `ProxyEngine` and registering it in `ENGINES`.
 */
import { signal } from "@preact/signals";
import type { EngineId, TransportId } from "../state/settings";
import { settings } from "../state/settings";
import { BASE } from "./runtime-config";
import { activeWispUrl, onWispRecovered, startWispMonitor } from "./wisp";
import { markLoaded } from "./modules";
import { downloads, type DownloadItem } from "../state/downloads";
import { uid } from "../lib/storage";

export interface ProxyEngine {
  id: EngineId;
  name: string;
  description: string;
  prepare(): Promise<void>;
  encode(url: string): string;
  /** Returns the real URL for a proxied location, or null if it isn't one of ours. */
  decode(href: string): string | null;
}

export type ModuleState = "idle" | "loading" | "ready" | "error";

export const engineState = signal<Record<EngineId, { state: ModuleState; error: string }>>({
  uv: { state: "idle", error: "" },
  scramjet: { state: "idle", error: "" },
});
export const transportState = signal<{ state: ModuleState; kind: TransportId | null; url: string; error: string }>({
  state: "idle",
  kind: null,
  url: "",
  error: "",
});

function setEngine(id: EngineId, state: ModuleState, error = "") {
  engineState.value = { ...engineState.peek(), [id]: { state, error } };
}

export class ProxyUnavailableError extends Error {
  constructor(
    message: string,
    public kind: "wisp" | "engine",
    public detail = "",
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Service workers

function serviceWorkerProblem(): string | null {
  if (!("serviceWorker" in navigator)) {
    return window.isSecureContext
      ? "This browser does not allow service workers here (Firefox private windows block them, for example)."
      : "Proxying needs a secure connection. Open NOVA over HTTPS (or on localhost).";
  }
  return null;
}

async function registerWorker(script: string, scope: string): Promise<ServiceWorkerRegistration> {
  const problem = serviceWorkerProblem();
  if (problem) throw new ProxyUnavailableError(problem, "engine");
  const reg = await navigator.serviceWorker.register(script, { scope, updateViaCache: "none" });
  const worker = reg.active ?? reg.waiting ?? reg.installing;
  if (reg.active) return reg;
  if (!worker) throw new Error("Service worker failed to install");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Service worker took too long to activate")), 20_000);
    const check = () => {
      if (worker.state === "activated") {
        clearTimeout(timer);
        resolve();
      } else if (worker.state === "redundant") {
        clearTimeout(timer);
        reject(new Error("Service worker installation failed"));
      }
    };
    worker.addEventListener("statechange", check);
    check();
  });
  return reg;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-src="${src}"]`);
    if (existing?.dataset.loaded) return resolve();
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => {
      el.dataset.loaded = "1";
      resolve();
    });
    el.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
    if (!existing) {
      el.src = src;
      el.dataset.src = src;
      document.head.appendChild(el);
    }
  });
}

// ---------------------------------------------------------------------------
// Ultraviolet

const UV_PREFIX = BASE + "uv/service/";

function xorEncode(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) out += i % 2 ? String.fromCharCode(s.charCodeAt(i) ^ 2) : s[i];
  return encodeURIComponent(out);
}
function xorDecode(s: string): string {
  const [input, ...search] = s.split("?");
  const decoded = decodeURIComponent(input ?? "");
  let out = "";
  for (let i = 0; i < decoded.length; i++) out += i % 2 ? String.fromCharCode(decoded.charCodeAt(i) ^ 2) : decoded[i];
  return out + (search.length ? "?" + search.join("?") : "");
}

const ultraviolet: ProxyEngine = {
  id: "uv",
  name: "Ultraviolet",
  description: "Mature and lightweight. Broad compatibility with classic websites.",
  async prepare() {
    await registerWorker(BASE + "uv/sw.js", UV_PREFIX);
    markLoaded("Ultraviolet engine");
  },
  encode: (url) => UV_PREFIX + xorEncode(url),
  decode(href) {
    try {
      const u = new URL(href, location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(UV_PREFIX)) return null;
      return xorDecode(u.pathname.slice(UV_PREFIX.length) + u.search) + u.hash;
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Scramjet

const SJ_PREFIX = BASE + "scram/service/";

interface ScramjetControllerLike {
  init(): Promise<void>;
  encodeUrl(url: string): string;
  decodeUrl(url: string): string;
  addEventListener(type: "download", fn: (e: { download: { filename?: string; url: string; type: string; body: ReadableStream<Uint8Array>; length: number } }) => void): void;
}
declare global {
  // eslint-disable-next-line no-var
  var $scramjetLoadController: () => { ScramjetController: new (cfg: object) => ScramjetControllerLike };
}

let scramjetController: ScramjetControllerLike | null = null;

async function handleDownload(d: { filename?: string; url: string; type: string; body: ReadableStream<Uint8Array>; length: number }) {
  const item: DownloadItem = {
    id: uid(),
    filename: d.filename || decodeURIComponent(new URL(d.url).pathname.split("/").pop() || "download"),
    url: d.url,
    type: d.type,
    size: d.length,
    received: 0,
    status: "downloading",
    objectUrl: "",
    startedAt: Date.now(),
  };
  downloads.value = [item, ...downloads.peek()];
  const patch = (p: Partial<DownloadItem>) => {
    downloads.value = downloads.peek().map((x) => (x.id === item.id ? { ...x, ...p } : x));
  };
  try {
    const reader = d.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastUpdate = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (performance.now() - lastUpdate > 250) {
        lastUpdate = performance.now();
        patch({ received });
      }
    }
    const blob = new Blob(chunks as BlobPart[], { type: d.type || "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);
    patch({ received, size: received, status: "done", objectUrl });
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = item.filename;
    a.click();
  } catch {
    patch({ status: "failed" });
  }
}

const scramjet: ProxyEngine = {
  id: "scramjet",
  name: "Scramjet",
  description: "Newer interception engine with a WebAssembly rewriter. Better on modern web apps.",
  async prepare() {
    if (!scramjetController) {
      await loadScript(BASE + "scram/vendor/scramjet.all.js");
      const { ScramjetController } = globalThis.$scramjetLoadController();
      const controller = new ScramjetController({
        prefix: SJ_PREFIX,
        files: {
          wasm: BASE + "scram/vendor/scramjet.wasm.wasm",
          all: BASE + "scram/vendor/scramjet.all.js",
          sync: BASE + "scram/vendor/scramjet.sync.js",
        },
        flags: { interceptDownloads: true },
      });
      await controller.init();
      controller.addEventListener("download", (e) => void handleDownload(e.download));
      scramjetController = controller;
    }
    await registerWorker(BASE + "scram/sw.js", SJ_PREFIX);
    markLoaded("Scramjet engine");
  },
  encode(url) {
    if (!scramjetController) throw new Error("Scramjet is not ready");
    return scramjetController.encodeUrl(url);
  },
  decode(href) {
    try {
      const u = new URL(href, location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(SJ_PREFIX)) return null;
      if (scramjetController) return scramjetController.decodeUrl(u.href);
      return decodeURIComponent(u.pathname.slice(SJ_PREFIX.length)) + u.search + u.hash;
    } catch {
      return null;
    }
  },
};

export const ENGINES: Record<EngineId, ProxyEngine> = { uv: ultraviolet, scramjet };

/** Real URL for any proxied location (any engine), or null. */
export function decodeAny(href: string): string | null {
  return ENGINES.uv.decode(href) ?? ENGINES.scramjet.decode(href);
}

// ---------------------------------------------------------------------------
// Transport (bare-mux + Wisp)

type BareMuxModule = typeof import("@mercuryworkshop/bare-mux");
let bareMux: Promise<InstanceType<BareMuxModule["BareMuxConnection"]>> | null = null;

function connection() {
  bareMux ??= import("@mercuryworkshop/bare-mux").then((m) => {
    markLoaded("bare-mux transport layer");
    return new m.BareMuxConnection(BASE + "baremux/worker.js");
  });
  return bareMux;
}

const TRANSPORT_FILES: Record<TransportId, string> = {
  epoxy: BASE + "transports/epoxy/index.mjs",
  libcurl: BASE + "transports/libcurl/index.mjs",
};

export async function applyTransport(force = false): Promise<void> {
  const kind = settings.peek().proxy.transport;
  const url = await activeWispUrl();
  const current = transportState.peek();
  if (!force && current.state === "ready" && current.kind === kind && current.url === url) return;
  transportState.value = { state: "loading", kind, url, error: "" };
  try {
    const conn = await connection();
    const opts = kind === "epoxy" ? { wisp: url } : { websocket: url };
    await conn.setTransport(TRANSPORT_FILES[kind], [opts]);
    markLoaded(kind === "epoxy" ? "Epoxy TLS transport" : "libcurl.js transport");
    transportState.value = { state: "ready", kind, url, error: "" };
  } catch (err) {
    transportState.value = { state: "error", kind, url, error: String((err as Error)?.message ?? err) };
    throw new ProxyUnavailableError("Could not start the encrypted transport.", "engine", String(err));
  }
}

let wiredRecovery = false;
const preparing: Partial<Record<EngineId, Promise<void>>> = {};

/** Makes an engine ready to load pages: transport configured and service worker active. */
export async function prepareEngine(id: EngineId): Promise<void> {
  startWispMonitor();
  if (!wiredRecovery) {
    wiredRecovery = true;
    // After an outage or failover, rebuild the transport so new requests use a fresh connection.
    onWispRecovered(() => {
      if (transportState.peek().state !== "idle") void applyTransport(true).catch(() => {});
    });
  }
  await applyTransport();
  if (engineState.peek()[id].state === "ready") return;
  preparing[id] ??= (async () => {
    setEngine(id, "loading");
    try {
      await ENGINES[id].prepare();
      setEngine(id, "ready");
    } catch (err) {
      const message = err instanceof ProxyUnavailableError ? err.message : String((err as Error)?.message ?? err);
      setEngine(id, "error", message);
      throw err instanceof ProxyUnavailableError ? err : new ProxyUnavailableError(`${ENGINES[id].name} failed to start.`, "engine", message);
    } finally {
      delete preparing[id];
    }
  })();
  return preparing[id];
}

/** Fetch through the proxy transport (used by optional widgets so they never contact third parties directly). */
export async function proxiedFetch(url: string, init?: RequestInit): Promise<Response> {
  await applyTransport();
  const m = await import("@mercuryworkshop/bare-mux");
  const client = new m.BareClient(BASE + "baremux/worker.js");
  return client.fetch(url, init) as unknown as Response;
}

export function isServiceWorkerSupported() {
  return serviceWorkerProblem() === null;
}
