import { settings, type ActionId } from "../state/settings";
import { comboFromEvent, isEditableTarget, normalizeCombo } from "./keys";
import { ACTIONS, ghostOpen } from "./actions";

/** Set while the shortcut editor is recording, so presses aren't executed. */
export let recordingShortcut = false;
export function setRecording(v: boolean) {
  recordingShortcut = v;
}

let comboMap = new Map<string, ActionId>();
let lastKey = "";
function rebuild() {
  const s = settings.peek();
  const key = JSON.stringify([s.shortcuts, s.ghost.enabled]);
  if (key === lastKey) return;
  lastKey = key;
  comboMap = new Map();
  for (const [id, combo] of Object.entries(s.shortcuts) as [ActionId, string][]) {
    if (!combo) continue;
    if (id === "ghost" && !s.ghost.enabled) continue;
    comboMap.set(normalizeCombo(combo), id);
  }
}

/**
 * Shared keydown handler. Attached to NOVA's window and to every same-origin
 * proxied frame, so shortcuts keep working while a website has focus.
 */
export function handleShortcut(e: KeyboardEvent) {
  if (recordingShortcut || e.defaultPrevented || e.repeat) return;
  rebuild();
  const combo = comboFromEvent(e);
  if (!combo) return;
  const action = comboMap.get(combo);
  if (!action) return;
  const s = settings.peek();
  // Never fire while the user is typing, unless they explicitly allowed it for Ghost.
  if (isEditableTarget(e.target) && !(action === "ghost" && s.ghost.allowInInputs)) return;
  if (ghostOpen.peek() && action !== "ghost") return;
  e.preventDefault();
  e.stopPropagation();
  ACTIONS[action]();
}

export function installShortcuts() {
  addEventListener("keydown", handleShortcut, true);
}

/** Attach to a proxied frame's window (same origin). Safe to call repeatedly. */
export function attachShortcutsToFrame(win: Window | null) {
  if (!win) return;
  try {
    const w = win as Window & { __novaKeys?: boolean };
    if (w.__novaKeys) return;
    w.__novaKeys = true;
    w.addEventListener("keydown", handleShortcut, true);
  } catch {
    /* cross-origin frame (e.g. strictly isolated games): cannot attach */
  }
}
