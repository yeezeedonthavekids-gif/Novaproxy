import { useMemo, useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import { history, deleteHistoryEntry, clearHistory } from "../state/history";
import { settings } from "../state/settings";
import { privateMode } from "../state/session";
import { activeTab, navigate, newTab } from "../state/tabs";
import { displayUrl } from "../lib/url";
import { openPage } from "../lib/actions";
import { BookmarkIcon } from "../components/BookmarkBar";
import { Icon } from "../components/Icon";
import { confirmAction, toast } from "../components/ui";
import "../styles/settings.css";

function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export default function HistoryPage(_props: PageProps) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);
  const list = history.value;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((e) => e.title.toLowerCase().includes(s) || e.url.toLowerCase().includes(s)) : list;
  }, [list, q]);
  const groups = useMemo(() => {
    const out: { label: string; items: typeof list }[] = [];
    for (const e of filtered.slice(0, limit)) {
      const label = dayLabel(e.visitedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [filtered, limit]);

  return (
    <div class="page">
      <div class="page-narrow">
        <div class="page-head">
          <div>
            <h1>History</h1>
            <p>
              Stored only on this device{settings.value.privacy.historyDays ? ` for ${settings.value.privacy.historyDays} days` : ""}.{" "}
              {privateMode.value && <strong>Private session: nothing new is being recorded.</strong>}
              {!settings.value.privacy.saveHistory && <strong> History saving is turned off.</strong>}
            </p>
          </div>
          <span class="spacer" />
          <button class="btn sm" onClick={() => openPage("privacy")}>
            <Icon name="shieldCheck" size={14} /> Privacy settings
          </button>
          <button
            class="btn sm danger"
            disabled={!list.length}
            onClick={async () => {
              if (await confirmAction("Clear all history?", "This removes every history entry NOVA stored on this device.", "Clear history")) {
                clearHistory();
                toast("History cleared", { icon: "trash" });
              }
            }}
          >
            Clear all
          </button>
        </div>
        <label class="search-field">
          <Icon name="search" size={16} />
          <input placeholder="Search history" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search history" />
        </label>
        {groups.length === 0 && (
          <div class="empty">
            <Icon name="clock" size={28} />
            <p>{q ? `Nothing in your history matches “${q}”.` : "No history yet."}</p>
          </div>
        )}
        {groups.map((g) => (
          <section class="section" key={g.label}>
            <header class="section-head">
              <h2>{g.label}</h2>
            </header>
            <div class="section-body">
              {g.items.map((e) => (
                <div class="list-row" key={e.url}>
                  <span class="faint mono" style={{ width: 64 }}>{new Date(e.visitedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  <BookmarkIcon icon={e.favicon} title={e.title} url={e.url} />
                  <button
                    class="list-row-label link-row"
                    style={{ textAlign: "left", whiteSpace: "nowrap" }}
                    onClick={(ev) => (ev.ctrlKey || ev.metaKey ? newTab(e.url, { background: true }) : navigate(activeTab.peek().id, e.url))}
                    title={e.url}
                  >
                    {e.title} <span class="faint" style={{ marginLeft: 6, fontSize: 12 }}>{displayUrl(e.url)}</span>
                  </button>
                  {e.visits > 1 && <span class="badge">{e.visits}×</span>}
                  <button class="icon-btn sm" aria-label={`Delete ${e.title} from history`} onClick={() => deleteHistoryEntry(e.url)}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
        {filtered.length > limit && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button class="btn" onClick={() => setLimit(limit + 200)}>
              Show more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
