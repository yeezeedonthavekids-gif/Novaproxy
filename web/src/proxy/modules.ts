import { signal } from "@preact/signals";

/** Registry of optional modules that have been loaded (shown in Diagnostics). */
export const loadedModules = signal<Record<string, number>>({ "NOVA shell": performance.now() });

export function markLoaded(name: string) {
  if (loadedModules.peek()[name]) return;
  loadedModules.value = { ...loadedModules.peek(), [name]: performance.now() };
}
