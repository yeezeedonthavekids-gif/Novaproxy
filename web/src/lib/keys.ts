/** Keyboard shortcut parsing, matching and conflict detection. */

const CODE_NAMES: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Space",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"]);

/** Key name based on the physical key, so Alt+G works on every keyboard layout (and on macOS where Alt+G types "©"). */
function keyName(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (e.code.startsWith("Key")) return e.code.slice(3);
  if (e.code.startsWith("Digit")) return e.code.slice(5);
  if (e.code.startsWith("Numpad") && /\d$/.test(e.code)) return e.code.slice(6);
  if (CODE_NAMES[e.code]) return CODE_NAMES[e.code]!;
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key; // ArrowLeft, Escape, F5, Enter, Tab...
}

export function comboFromEvent(e: KeyboardEvent): string | null {
  const key = keyName(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(key);
  return parts.join("+");
}

export function normalizeCombo(combo: string): string {
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  const mods = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));
  const key = parts[parts.length - 1] ?? "";
  const out: string[] = [];
  if (mods.has("ctrl") || mods.has("control")) out.push("Ctrl");
  if (mods.has("alt") || mods.has("option")) out.push("Alt");
  if (mods.has("shift")) out.push("Shift");
  if (mods.has("meta") || mods.has("cmd") || mods.has("command")) out.push("Meta");
  out.push(key.length === 1 ? key.toUpperCase() : key);
  return out.join("+");
}

export function hasModifier(combo: string): boolean {
  return /^(Ctrl|Alt|Meta)\+/.test(combo) || /\+(Alt|Meta)\+/.test(combo);
}

/** Shortcuts the browser itself handles before any web page sees them. */
const RESERVED = new Set([
  "Ctrl+T", "Ctrl+N", "Ctrl+W", "Ctrl+Shift+T", "Ctrl+Shift+N", "Ctrl+Shift+W", "Ctrl+Tab",
  "Ctrl+Shift+Tab", "Meta+T", "Meta+N", "Meta+W", "Meta+Q", "Meta+Shift+T", "Alt+F4", "Ctrl+Shift+Q",
]);
/** Shortcuts the browser uses that NOVA can override, but users may expect the browser behaviour. */
const COMMON = new Set([
  "Ctrl+R", "Ctrl+F", "Ctrl+D", "Ctrl+H", "Ctrl+P", "Ctrl+S", "Ctrl+L", "Ctrl+J", "Ctrl+U", "F5", "F11", "F12",
  "Meta+R", "Meta+F", "Meta+D", "Meta+L", "Meta+P", "Meta+S", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Ctrl+Z",
  "Meta+C", "Meta+V", "Meta+X", "Meta+A", "Meta+Z",
]);

export type ComboProblem = { level: "error" | "warning"; message: string } | null;

export function checkCombo(combo: string, others: Record<string, string>, selfId: string): ComboProblem {
  const c = normalizeCombo(combo);
  if (RESERVED.has(c)) return { level: "error", message: `${c} is reserved by the browser and never reaches NOVA.` };
  for (const [id, other] of Object.entries(others)) {
    if (id !== selfId && other && normalizeCombo(other) === c) {
      return { level: "error", message: `${c} is already used by "${id}".` };
    }
  }
  if (!hasModifier(c) && !/^F\d+$/.test(c) && c !== "Escape") {
    return { level: "warning", message: "Shortcuts without Ctrl, Alt or Meta are easy to trigger by accident." };
  }
  if (COMMON.has(c)) return { level: "warning", message: `${c} overrides a common browser shortcut.` };
  return null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target as Element).tagName) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "color", "submit", "reset", "file", "image"].includes(type);
  }
  return el.isContentEditable;
}

export function prettyCombo(combo: string): string {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return normalizeCombo(combo)
    .split("+")
    .map((p) => (mac ? { Meta: "⌘", Alt: "⌥", Shift: "⇧", Ctrl: "⌃" }[p] ?? p : p === "Meta" ? "Win" : p))
    .join(mac ? "" : "+");
}
