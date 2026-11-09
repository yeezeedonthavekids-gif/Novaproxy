/**
 * Local persistence. Everything NOVA stores lives in this browser only, under
 * keys prefixed with "nova:" so privacy tools can tell NOVA's own data apart
 * from data saved by proxied websites.
 */
export const PREFIX = "nova:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, () => void>();

/** Debounced write: rapid changes (typing, dragging) cost a single write. */
export function save(key: string, value: unknown, delay = 250) {
  const write = () => {
    timers.delete(key);
    pending.delete(key);
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      console.warn(`[nova] could not save ${key}:`, err);
    }
  };
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  pending.set(key, write);
  timers.set(key, setTimeout(write, delay));
}

export function remove(key: string) {
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  timers.delete(key);
  pending.delete(key);
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Flush debounced writes immediately (called before the page unloads). */
export function flush() {
  for (const write of [...pending.values()]) write();
}

addEventListener("pagehide", flush);

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
