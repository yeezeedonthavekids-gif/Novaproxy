import { useEffect, useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import { settings } from "../state/settings";
import { tabs } from "../state/tabs";
import { wispStatus, probeWisp, checkWisp } from "../proxy/wisp";
import { ENGINES, engineState, transportState, isServiceWorkerSupported } from "../proxy/index";
import { loadedModules } from "../proxy/modules";
import { formatBytes } from "../lib/sitedata";
import { isInternal } from "../lib/url";
import { Icon } from "../components/Icon";
import { Section } from "../components/ui";
import "../styles/settings.css";
import "../styles/privacy.css";

type Mem = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
type Conn = { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div class="metric">
      <span class="faint">{label}</span>
      <strong>{value}</strong>
      {note && <span class="hint">{note}</span>}
    </div>
  );
}

function ms(n: number | undefined) {
  return n === undefined || !isFinite(n) ? "—" : `${Math.round(n)} ms`;
}

/** Samples main-thread responsiveness only while this page is open and visible. */
function useResponsiveness(active: boolean) {
  const [lag, setLag] = useState<{ avg: number; max: number } | null>(null);
  const [longTasks, setLongTasks] = useState<{ count: number; blocking: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const samples: number[] = [];
    let expected = performance.now() + 500;
    const timer = setInterval(() => {
      const now = performance.now();
      samples.push(Math.max(0, now - expected));
      if (samples.length > 60) samples.shift();
      expected = now + 500;
      setLag({ avg: samples.reduce((a, b) => a + b, 0) / samples.length, max: Math.max(...samples) });
    }, 500);
    let observer: PerformanceObserver | null = null;
    const tasks: { t: number; d: number }[] = [];
    if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      setLongTasks({ count: 0, blocking: 0 });
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) tasks.push({ t: e.startTime, d: e.duration });
        const cutoff = performance.now() - 60_000;
        while (tasks.length && tasks[0]!.t < cutoff) tasks.shift();
        setLongTasks({ count: tasks.length, blocking: tasks.reduce((a, x) => a + Math.max(0, x.d - 50), 0) });
      });
      observer.observe({ type: "longtask", buffered: false });
    }
    return () => {
      clearInterval(timer);
      observer?.disconnect();
    };
  }, [active]);
  return { lag, longTasks };
}

export default function DiagnosticsPage({ active }: PageProps) {
  const [, setTick] = useState(0);
  const [health, setHealth] = useState<{ ok: boolean; data?: Record<string, unknown>; error?: string } | null>(null);
  const [bench, setBench] = useState<string>("");
  const [regs, setRegs] = useState<string[]>([]);
  const { lag, longTasks } = useResponsiveness(active);
  const st = wispStatus.value;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), 2000);
    void navigator.serviceWorker?.getRegistrations?.().then((r) => setRegs(r.map((x) => new URL(x.scope).pathname)));
    return () => clearInterval(timer);
  }, [active]);

  const mem = (performance as Performance & { memory?: Mem }).memory;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: Conn };
  const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
  const list = tabs.value;
  const web = list.filter((t) => !isInternal(t.url));

  const checkHealth = async () => {
    setHealth(null);
    try {
      const u = new URL(st.url || st.candidates[0] || `${location.origin}/wisp/`);
      u.protocol = u.protocol === "wss:" ? "https:" : "http:";
      u.pathname = "/health";
      const res = await fetch(u.href, { cache: "no-store" });
      setHealth({ ok: res.ok, data: await res.json() });
    } catch (e) {
      setHealth({ ok: false, error: `${(e as Error).message}. The server may be older, or a proxy in front of it blocks /health.` });
    }
  };

  const runBench = async () => {
    const url = st.url || st.candidates[0];
    if (!url) return;
    setBench("Running 5 handshakes…");
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await probeWisp(url);
      if (!r.ok) return setBench(`Failed: ${r.error}`);
      times.push(r.latency);
    }
    setBench(`min ${Math.min(...times)} ms · avg ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)} ms · max ${Math.max(...times)} ms`);
  };

  return (
    <div class="page">
      <div class="page-narrow">
        <div class="page-head">
          <div>
            <h1>Diagnostics</h1>
            <p>Live measurements from your browser. Values the browser doesn't expose are shown as unavailable, never estimated.</p>
          </div>
        </div>

        <Section title="Wisp connection" actions={<button class="btn sm" onClick={() => void checkWisp()}><Icon name="reload" size={14} /> Re-check</button>}>
          <div class="metrics">
            <Metric label="Status" value={{ unknown: "Idle", checking: "Checking", online: "Online", offline: "Offline" }[st.state]} note={st.state === "offline" ? st.error : undefined} />
            <Metric label="Handshake latency" value={ms(st.latency ?? undefined)} note="Time to complete a real Wisp handshake" />
            <Metric label="Last checked" value={st.checkedAt ? new Date(st.checkedAt).toLocaleTimeString() : "—"} note={st.failures ? `${st.failures} failed attempt(s), retrying with backoff` : undefined} />
            <Metric label="Server" value={st.url ? new URL(st.url).host : "—"} note={st.candidates.length > 1 ? `${st.candidates.length} servers configured (failover)` : undefined} />
          </div>
          <div class="list-row">
            <button class="btn sm" onClick={() => void runBench()}>
              <Icon name="activity" size={14} /> Latency test
            </button>
            <span class="hint">{bench}</span>
          </div>
          <div class="list-row">
            <button class="btn sm" onClick={() => void checkHealth()}>
              <Icon name="cloud" size={14} /> Server health
            </button>
            {health && (health.ok && health.data ? (
              <span class="hint">
                {String(health.data.service)} v{String(health.data.version)} · up {Math.round(Number(health.data.uptimeSeconds) / 60)} min · {String((health.data.wisp as Record<string, number>)?.activeConnections)} active connections
              </span>
            ) : (
              <span class="error-text">{health.error ?? "Server reported a problem"}</span>
            ))}
          </div>
        </Section>

        <Section title="Proxy engines">
          {(Object.values(ENGINES)).map((e) => {
            const s = engineState.value[e.id];
            return (
              <div class="list-row" key={e.id}>
                <span class={`dot ${s.state === "ready" ? "online" : s.state === "error" ? "offline" : s.state === "loading" ? "checking" : ""}`} />
                <span class="list-row-label">
                  <strong>{e.name}</strong> <span class="faint">{s.state === "idle" ? "not loaded (starts on first use)" : s.state}</span>
                  {s.error && <div class="error-text">{s.error}</div>}
                </span>
                {settings.value.proxy.engine === e.id && <span class="badge accent">Default</span>}
              </div>
            );
          })}
          <div class="list-row">
            <span class={`dot ${transportState.value.state === "ready" ? "online" : transportState.value.state === "error" ? "offline" : ""}`} />
            <span class="list-row-label">
              <strong>Transport</strong> <span class="faint">{transportState.value.kind ?? settings.value.proxy.transport} · {transportState.value.state}</span>
              {transportState.value.error && <div class="error-text">{transportState.value.error}</div>}
            </span>
          </div>
          <div class="list-row hint">
            Service workers: {isServiceWorkerSupported() ? (regs.length ? regs.join(", ") : "none registered yet") : "unavailable in this browser context"}
          </div>
        </Section>

        <Section title="Memory & CPU">
          <div class="metrics">
            <Metric
              label="JavaScript heap (this page)"
              value={mem ? formatBytes(mem.usedJSHeapSize) : "Unavailable"}
              note={mem ? `of ${formatBytes(mem.totalJSHeapSize)} allocated · Chromium only, excludes proxied frames on other processes` : "This browser doesn't expose memory usage"}
            />
            <Metric label="Main-thread delay" value={lag ? `${lag.avg.toFixed(1)} ms avg` : "Measuring…"} note={lag ? `worst ${Math.round(lag.max)} ms in the last 30 s` : "Timer drift sampled while this page is open"} />
            <Metric
              label="Long tasks (60 s)"
              value={longTasks ? String(longTasks.count) : "Unavailable"}
              note={longTasks ? `${Math.round(longTasks.blocking)} ms total blocking time` : "Long Task API not supported in this browser"}
            />
            <Metric label="CPU threads" value={navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : "Unavailable"} note="Logical cores reported by the browser" />
            <Metric label="Device memory" value={nav.deviceMemory ? `≈ ${nav.deviceMemory} GB` : "Unavailable"} note="Browser-reported bucket (capped at 8 GB), not a measurement" />
            <Metric label="Performance profile" value={settings.value.performance.mode} note={`${web.length} web tabs · ${list.filter((t) => t.discarded).length} sleeping`} />
          </div>
        </Section>

        <Section title="Page loading">
          <div class="metrics">
            <Metric label="Server response (TTFB)" value={ms(navEntry?.responseStart)} />
            <Metric label="First paint with content" value={ms(fcp)} />
            <Metric label="DOM ready" value={ms(navEntry?.domContentLoadedEventEnd)} />
            <Metric label="Fully loaded" value={ms(navEntry?.loadEventEnd || undefined)} />
            <Metric label="Transferred" value={navEntry?.transferSize ? formatBytes(navEntry.transferSize) : "Cached / unavailable"} note="Initial HTML document" />
            <Metric
              label="Network"
              value={nav.connection?.effectiveType ? nav.connection.effectiveType.toUpperCase() : "Unavailable"}
              note={nav.connection?.downlink ? `Browser estimate: ~${nav.connection.downlink} Mbps, ~${nav.connection.rtt} ms RTT${nav.connection.saveData ? " · Data Saver on" : ""}` : undefined}
            />
          </div>
        </Section>

        <Section title="Loaded modules" desc="NOVA loads features only when you use them.">
          {Object.entries(loadedModules.value).map(([name, t]) => (
            <div class="list-row" key={name}>
              <Icon name="check" size={15} />
              <span class="list-row-label">{name}</span>
              <span class="faint mono">{(t / 1000).toFixed(2)} s</span>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}
