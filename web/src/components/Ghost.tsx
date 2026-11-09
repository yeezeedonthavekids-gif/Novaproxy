import { useEffect, useRef, useState } from "preact/hooks";
import { settings } from "../state/settings";
import { ghostOpen, openPage } from "../lib/actions";
import { goToDestination, resolveDestination } from "../lib/ghost";
import { prettyCombo } from "../lib/keys";
import { displayUrl } from "../lib/url";
import { Icon } from "./Icon";

/** Ghost: a quick-navigation palette for jumping to your usual destinations. */
export function Ghost() {
  const open = ghostOpen.value;
  const g = settings.value.ghost;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(Math.max(0, g.destinations.findIndex((d) => d.id === g.defaultId)));
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  if (!open) return null;
  const list = g.destinations.filter((d) => !q || d.label.toLowerCase().includes(q.toLowerCase()) || d.url.toLowerCase().includes(q.toLowerCase()));
  const close = () => (ghostOpen.value = false);
  const go = (i: number) => {
    const d = list[i];
    if (!d) return;
    close();
    goToDestination(d);
  };

  return (
    <div class="modal-scrim ghost-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div class="ghost" role="dialog" aria-modal="true" aria-label="Ghost quick navigation">
        <div class="ghost-input">
          <Icon name="ghost" size={20} />
          <input
            ref={input}
            placeholder="Jump to…"
            value={q}
            aria-label="Filter destinations"
            onInput={(e) => {
              setQ(e.currentTarget.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, list.length - 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
              else if (e.key === "Enter") (e.preventDefault(), go(sel));
              else if (!q && /^[1-9]$/.test(e.key)) (e.preventDefault(), go(Number(e.key) - 1));
            }}
          />
          <span class="kbd">Esc</span>
        </div>
        <div class="ghost-list" role="listbox">
          {list.map((d, i) => {
            const url = resolveDestination(d);
            return (
              <button key={d.id} class="ghost-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
                <span class="ghost-num">{i + 1}</span>
                <span class="ghost-text">
                  <span>{d.label}</span>
                  <span class="faint">{displayUrl(url)}</span>
                </span>
                {d.id === g.defaultId && <span class="badge accent">Default</span>}
                {!url.startsWith("nova://") && <span class="badge">{g.openIn === "window" ? "Opens directly" : "New tab"}</span>}
              </button>
            );
          })}
          {!list.length && <div class="hint" style={{ padding: 14 }}>No destination matches “{q}”.</div>}
        </div>
        <div class="ghost-foot">
          <span class="hint">
            <span class="kbd">1</span>–<span class="kbd">9</span> jump · <span class="kbd">↵</span> open · {prettyCombo(settings.value.shortcuts.ghost)} toggles Ghost
          </span>
          <button class="btn sm ghost" onClick={() => (close(), openPage("settings"))}>
            <Icon name="gear" size={13} /> Configure
          </button>
        </div>
      </div>
    </div>
  );
}
