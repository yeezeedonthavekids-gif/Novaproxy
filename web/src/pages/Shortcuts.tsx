import { useEffect, useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import { settings, updateSettings, ACTION_LABELS, DEFAULT_SHORTCUTS, type ActionId } from "../state/settings";
import { checkCombo, comboFromEvent, prettyCombo, type ComboProblem } from "../lib/keys";
import { setRecording } from "../lib/shortcuts";
import { Icon } from "../components/Icon";
import { Section, toast } from "../components/ui";
import "../styles/settings.css";

/** Click, then press a key combination. Conflicts and browser-reserved keys are rejected with an explanation. */
export function ShortcutEditor({ action }: { action: ActionId }) {
  const combo = settings.value.shortcuts[action];
  const [recording, setRec] = useState(false);
  const [problem, setProblem] = useState<ComboProblem>(null);

  useEffect(() => {
    if (!recording) return;
    setRecording(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRec(false);
      if (e.key === "Backspace" || e.key === "Delete") {
        updateSettings((s) => (s.shortcuts[action] = ""));
        setProblem(null);
        return setRec(false);
      }
      const c = comboFromEvent(e);
      if (!c) return; // modifier alone, keep waiting
      const p = checkCombo(c, settings.peek().shortcuts, action);
      setProblem(p);
      if (p?.level === "error") return;
      updateSettings((s) => (s.shortcuts[action] = c));
      setRec(false);
    };
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      setRecording(false);
    };
  }, [recording]);

  return (
    <div class="sc-editor">
      <button class={`sc-key${recording ? " recording" : ""}`} onClick={() => setRec(!recording)} aria-label={`Change shortcut for ${ACTION_LABELS[action]}`}>
        {recording ? "Press keys… (Esc cancels, ⌫ clears)" : combo ? <span class="kbd">{prettyCombo(combo)}</span> : <span class="faint">Not set</span>}
      </button>
      {problem && <span class={problem.level === "error" ? "error-text" : "warn-text"}>{problem.message}</span>}
    </div>
  );
}

export function ShortcutList() {
  const sc = settings.value.shortcuts;
  return (
    <Section
      title="Keyboard shortcuts"
      desc="Shortcuts also work while a website has focus. They never fire while you're typing in a text field (except Ghost, if you allow it). Some combinations, like Ctrl+T or Ctrl+W, belong to the browser and can't be used."
      actions={
        <button
          class="btn sm"
          onClick={() => {
            updateSettings((s) => (s.shortcuts = { ...DEFAULT_SHORTCUTS }));
            toast("Shortcuts restored to defaults");
          }}
        >
          <Icon name="reload" size={14} /> Restore defaults
        </button>
      }
    >
      {(Object.keys(ACTION_LABELS) as ActionId[]).map((id) => (
        <div class="list-row" key={id}>
          <span class="list-row-label">{ACTION_LABELS[id]}</span>
          <ShortcutEditor action={id} />
          {sc[id] !== DEFAULT_SHORTCUTS[id] && (
            <button class="icon-btn sm" title={`Reset to ${DEFAULT_SHORTCUTS[id]}`} aria-label="Reset to default" onClick={() => updateSettings((s) => (s.shortcuts[id] = DEFAULT_SHORTCUTS[id]))}>
              <Icon name="reload" size={13} />
            </button>
          )}
        </div>
      ))}
    </Section>
  );
}

export default function ShortcutsPage(_props: PageProps) {
  return (
    <div class="page">
      <div class="page-narrow">
        <div class="page-head">
          <div>
            <h1>Keyboard shortcuts</h1>
            <p>Click a shortcut to record a new one.</p>
          </div>
        </div>
        <ShortcutList />
      </div>
    </div>
  );
}
