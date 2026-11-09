import { signal } from "@preact/signals";
import { load } from "../lib/storage";

/**
 * Private session: while enabled NOVA records no history, does not persist
 * tabs, and clears proxied site data when the session ends.
 */
const startPrivate = load<{ privacy?: { startPrivate?: boolean } }>("settings", {}).privacy?.startPrivate ?? false;
export const privateMode = signal<boolean>(startPrivate);
