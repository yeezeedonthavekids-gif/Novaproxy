import { history } from "../../state/history";
import { bookmarks, ROOT_BAR } from "../../state/bookmarks";
import { gamePrefs, pendingGame } from "../../state/games";
import { notes } from "../../state/notes";
import { activeTab, navigate } from "../../state/tabs";
import { openPage } from "../../lib/actions";
import { displayUrl } from "../../lib/url";
import { BookmarkIcon, openBookmark } from "../../components/BookmarkBar";
import { Icon } from "../../components/Icon";

export function Recent() {
  const items = history.value.slice(0, 6);
  if (!items.length) return <p class="hint w-empty">Sites you visit will show up here. History stays on this device.</p>;
  return (
    <ul class="w-list">
      {items.map((h) => (
        <li key={h.url}>
          <button class="w-row" onClick={() => navigate(activeTab.peek().id, h.url)} title={h.url}>
            <BookmarkIcon icon={h.favicon} title={h.title} url={h.url} />
            <span class="w-row-title">{h.title}</span>
            <span class="w-row-sub">{displayUrl(h.url)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GamesWidget() {
  const recent = gamePrefs.value.recent.slice(0, 4);
  return (
    <div>
      {recent.length ? (
        <div class="w-games">
          {recent.map((g) => (
            <button
              key={g.id}
              class="w-game"
              title={g.name}
              onClick={() => {
                pendingGame.value = g.id;
                openPage("games");
              }}
            >
              <img src={g.cover} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
              <span>{g.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p class="hint w-empty">Games you play will appear here.</p>
      )}
      <button class="btn sm" style={{ marginTop: 10 }} onClick={() => openPage("games")}>
        <Icon name="gamepad" size={14} /> Open game library
      </button>
    </div>
  );
}

export function Notes() {
  return (
    <textarea
      class="textarea w-notes"
      aria-label="Notes"
      placeholder="Jot something down… (saved on this device)"
      value={notes.value}
      onInput={(e) => (notes.value = e.currentTarget.value)}
    />
  );
}

export function BookmarksWidget() {
  const nodes = bookmarks.value.nodes;
  const items = (nodes[ROOT_BAR]?.children ?? []).map((id) => nodes[id]!).filter((n) => n?.type === "link").slice(0, 8);
  if (!items.length) return <p class="hint w-empty">Bookmarks on your bookmarks bar show up here.</p>;
  return (
    <ul class="w-list">
      {items.map((n) => (
        <li key={n.id}>
          <button class="w-row" onClick={() => openBookmark(n)} title={n.url}>
            <BookmarkIcon icon={n.icon} title={n.title} url={n.url} />
            <span class="w-row-title">{n.title}</span>
            <span class="w-row-sub">{displayUrl(n.url ?? "")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
