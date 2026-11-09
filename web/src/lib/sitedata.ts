import { PREFIX } from "./storage";
import { NOVA_DATABASES } from "./idb";
import { engineState } from "../proxy/index";

export interface ClearResult {
  storageKeys: number;
  databases: number;
  caches: number;
  cookies: number;
}

/**
 * Proxied websites run on NOVA's origin, so their cookies (emulated by the
 * engines in IndexedDB), localStorage and caches live alongside NOVA's own
 * data. This removes everything that isn't NOVA's own (keys prefixed "nova:"
 * and the "nova-media" database).
 */
export async function clearProxiedSiteData(): Promise<ClearResult> {
  const result: ClearResult = { storageKeys: 0, databases: 0, caches: 0, cookies: 0 };
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(store)) {
        if (!key.startsWith(PREFIX)) {
          store.removeItem(key);
          result.storageKeys++;
        }
      }
    } catch {
      /* storage unavailable */
    }
  }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs
        .filter((d) => d.name && !NOVA_DATABASES.has(d.name))
        .map(
          (d) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
              result.databases++;
            }),
        ),
    );
  } catch {
    /* databases() unsupported (older Firefox) */
  }
  try {
    for (const key of await caches.keys()) {
      await caches.delete(key);
      result.caches++;
    }
  } catch {
    /* no Cache API */
  }
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (!name) continue;
    for (const path of ["/", location.pathname]) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
    result.cookies++;
  }
  // Scramjet keeps its configuration in IndexedDB; make it re-initialise next time.
  engineState.value = { ...engineState.peek(), scramjet: { state: "idle", error: "" } };
  return result;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
