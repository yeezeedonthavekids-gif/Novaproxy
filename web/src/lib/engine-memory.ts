/**
 * Auto engine selection.
 *
 * Both engines share the same Wisp connection, so neither is "faster" in
 * general: what differs is how well each one handles a particular site. NOVA
 * remembers, per site, which engine loaded it (and how quickly) or failed, and
 * picks the best one next time. A manual choice always wins for that site.
 * Everything is stored locally and never leaves the browser.
 */
import { load, save } from "./storage";
import type { EngineId } from "../state/settings";

interface Stat {
  ok: number;
  fail: number;
  /** Rolling average load time in ms (successful loads only). */
  ms: number;
}
interface SiteRecord {
  pref?: EngineId;
  uv?: Stat;
  scramjet?: Stat;
  t: number;
}

const MAX_SITES = 400;
let memory = load<Record<string, SiteRecord>>("engine-memory", {});

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function persist() {
  const entries = Object.entries(memory);
  if (entries.length > MAX_SITES) {
    entries.sort((a, b) => b[1].t - a[1].t);
    memory = Object.fromEntries(entries.slice(0, MAX_SITES));
  }
  save("engine-memory", memory, 1000);
}

function record(url: string): SiteRecord | null {
  const site = siteOf(url);
  if (!site) return null;
  memory[site] ??= { t: Date.now() };
  memory[site]!.t = Date.now();
  return memory[site]!;
}

export function recordSuccess(url: string, engine: EngineId, ms: number) {
  const r = record(url);
  if (!r) return;
  const s = (r[engine] ??= { ok: 0, fail: 0, ms });
  s.ms = s.ok === 0 ? ms : Math.round(s.ms * 0.7 + ms * 0.3);
  s.ok++;
  persist();
}

export function recordFailure(url: string, engine: EngineId) {
  const r = record(url);
  if (!r) return;
  const s = (r[engine] ??= { ok: 0, fail: 0, ms: 0 });
  s.fail++;
  if (r.pref === engine) delete r.pref; // a remembered choice that stopped working is forgotten
  persist();
}

/** The user picked an engine for this site by hand: always use it there. */
export function recordPreference(url: string, engine: EngineId) {
  const r = record(url);
  if (!r) return;
  r.pref = engine;
  persist();
}

function score(s: Stat | undefined): number {
  if (!s || s.ok === 0) return s?.fail ? Infinity : NaN; // NaN = unknown
  return s.ms * (1 + s.fail / (s.ok + s.fail));
}

/** Best engine for a URL, or null when NOVA has nothing to go on yet. */
export function bestEngine(url: string): EngineId | null {
  const r = memory[siteOf(url)];
  if (!r) return null;
  if (r.pref) return r.pref;
  const uv = score(r.uv);
  const sj = score(r.scramjet);
  if (Number.isNaN(uv) && Number.isNaN(sj)) return null;
  if (Number.isNaN(uv)) return sj === Infinity ? "uv" : "scramjet";
  if (Number.isNaN(sj)) return uv === Infinity ? "scramjet" : "uv";
  if (uv === Infinity && sj === Infinity) return null;
  return uv <= sj ? "uv" : "scramjet";
}

export function forgetEngineMemory() {
  memory = {};
  save("engine-memory", memory, 0);
}

export function engineMemorySize(): number {
  return Object.keys(memory).length;
}
