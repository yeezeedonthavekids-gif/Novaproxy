import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PageProps } from "../components/Content";
import { gamePrefs, toggleFavorite, markPlayed, pendingGame } from "../state/games";
import { settings, updateSettings } from "../state/settings";
import { newTab } from "../state/tabs";
import { attachShortcutsToFrame } from "../lib/shortcuts";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/ui";
import { loadCatalog, loadGameHtml, CATEGORY_LABELS, type Game } from "./games-catalog";
import "../styles/games.css";

const PAGE = 60;

function Cover({ game }: { game: Game }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div class="g-cover g-cover-fallback">{game.name.charAt(0)}</div>
  ) : (
    <img class="g-cover" src={game.cover} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

function GameCard({ game, onPlay }: { game: Game; onPlay: (g: Game) => void }) {
  const fav = gamePrefs.value.favorites.includes(game.id);
  return (
    <div class="g-card">
      <button class="g-card-main" onClick={() => onPlay(game)} title={`Play ${game.name}`}>
        <div class="g-cover-wrap">
          <Cover game={game} />
          <span class="g-play">
            <Icon name="play" size={18} filled />
          </span>
        </div>
        <span class="g-name">{game.name}</span>
        <span class="g-author">{game.author || "Unknown creator"}</span>
      </button>
      <button class={`g-fav${fav ? " on" : ""}`} aria-label={fav ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`} aria-pressed={fav} onClick={() => toggleFavorite(game.id)}>
        <Icon name="heart" size={15} filled={fav} />
      </button>
    </div>
  );
}

function Player({ game, onClose }: { game: Game; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const isolation = settings.value.games.isolation;
  const fav = gamePrefs.value.favorites.includes(game.id);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError("");
    loadGameHtml(game).then(
      (h) => !cancelled && setHtml(h),
      (e) => !cancelled && setError(String(e?.message ?? e)),
    );
    markPlayed({ id: game.id, name: game.name, cover: game.cover });
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement && !(e.target as HTMLElement)?.closest?.("input,textarea")) onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const sandbox =
    "allow-scripts allow-pointer-lock allow-forms allow-popups allow-modals allow-downloads allow-orientation-lock" +
    (isolation === "compatible" ? " allow-same-origin" : "");

  return (
    <div class="g-player">
      <div class="g-player-bar">
        <button class="btn sm ghost" onClick={onClose}>
          <Icon name="back" size={15} /> Library
        </button>
        <div class="g-player-title">
          <strong>{game.name}</strong>
          {game.author && (
            <span class="faint">
              by{" "}
              {game.authorLink ? (
                <a href="#" onClick={(e) => (e.preventDefault(), newTab(game.authorLink))}>
                  {game.author}
                </a>
              ) : (
                game.author
              )}
            </span>
          )}
        </div>
        <span class="spacer" />
        <Segmented
          label="Game isolation"
          value={isolation}
          onChange={(v) => updateSettings((s) => (s.games.isolation = v))}
          options={[
            { value: "strict", label: "Isolated", icon: "shield" },
            { value: "compatible", label: "Compatible", icon: "bolt" },
          ]}
        />
        <button class={`icon-btn${fav ? " on" : ""}`} aria-label="Favorite" aria-pressed={fav} onClick={() => toggleFavorite(game.id)}>
          <Icon name="heart" filled={fav} />
        </button>
        <button class="icon-btn" aria-label="Restart game" title="Restart" onClick={() => setReloadKey((k) => k + 1)}>
          <Icon name="reload" />
        </button>
        <button class="icon-btn" aria-label="Fullscreen" title="Fullscreen" onClick={() => void wrap.current?.requestFullscreen?.()}>
          <Icon name="expand" />
        </button>
      </div>
      <div class="g-stage" ref={wrap}>
        {error ? (
          <div class="empty">
            <Icon name="alert" size={28} />
            <p>Couldn't load {game.name}: {error}</p>
            <button class="btn" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        ) : html === null ? (
          <div class="page-loading">
            <span class="spinner" />
          </div>
        ) : (
          <iframe
            key={`${reloadKey}-${isolation}`}
            ref={frame}
            title={game.name}
            srcdoc={html}
            sandbox={sandbox}
            allow="fullscreen; autoplay; gamepad"
            referrerpolicy="no-referrer"
            onLoad={() => isolation === "compatible" && attachShortcutsToFrame(frame.current?.contentWindow ?? null)}
          />
        )}
      </div>
      <p class="hint g-note">
        {isolation === "strict"
          ? "Isolated mode keeps the game away from NOVA's data. If a game won't start or can't save progress, switch to Compatible."
          : "Compatible mode lets games use storage (saves, settings) but they then share NOVA's origin. Only use it with games you trust."}
      </p>
    </div>
  );
}

export default function GamesPage(_props: PageProps) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [playing, setPlaying] = useState<Game | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const prefs = gamePrefs.value;
  const category = prefs.category;

  const fetchCatalog = () => {
    setError("");
    loadCatalog().then(setGames, (e) => setError(String(e?.message ?? e)));
  };
  useEffect(fetchCatalog, []);

  // Open a game requested from the home page widget.
  useEffect(() => {
    if (!games || pendingGame.value === null) return;
    const g = games.find((x) => x.id === pendingGame.peek());
    pendingGame.value = null;
    if (g) setPlaying(g);
  }, [games, pendingGame.value]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    games?.forEach((g) => g.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return Object.keys(CATEGORY_LABELS).filter((c) => counts.has(c)).map((c) => ({ id: c, label: CATEGORY_LABELS[c]!, count: counts.get(c)! }));
  }, [games]);

  const filtered = useMemo(() => {
    if (!games) return [];
    const q = query.trim().toLowerCase();
    let list = games;
    if (category === "favorites") list = prefs.favorites.map((id) => games.find((g) => g.id === id)).filter(Boolean) as Game[];
    else if (category === "recent") list = prefs.recent.map((r) => games.find((g) => g.id === r.id)).filter(Boolean) as Game[];
    else if (category === "featured") list = games.filter((g) => g.featured);
    else if (category !== "all") list = games.filter((g) => g.tags.includes(category));
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.author.toLowerCase().includes(q));
    if (category !== "recent" && category !== "favorites") {
      if (prefs.sort === "az") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      else if (prefs.sort === "za") list = [...list].sort((a, b) => b.name.localeCompare(a.name));
      else list = [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
    }
    return list;
  }, [games, query, category, prefs.sort, prefs.favorites, prefs.recent]);

  useEffect(() => setLimit(PAGE), [query, category, prefs.sort]);

  // Render cards incrementally as the user scrolls (keeps the DOM small on low-end devices).
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [games, playing, filtered.length > limit]);

  const setCategory = (c: string) => (gamePrefs.value = { ...gamePrefs.peek(), category: c });

  if (playing) return <Player game={playing} onClose={() => setPlaying(null)} />;

  const recent = prefs.recent.map((r) => games?.find((g) => g.id === r.id)).filter(Boolean).slice(0, 8) as Game[];

  return (
    <div class="page games-page">
      <div class="page-wide">
        <header class="g-hero">
          <div>
            <div class="g-eyebrow">
              <Icon name="gamepad" size={14} /> NOVA Arcade
            </div>
            <h1>Games</h1>
            <p class="muted">{games ? `${games.length} games, loaded on demand` : "Loading the library…"}</p>
          </div>
          <label class="g-search">
            <Icon name="search" size={16} />
            <input placeholder="Search games or creators" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Search games" />
            {query && (
              <button class="icon-btn sm" aria-label="Clear search" onClick={() => setQuery("")}>
                <Icon name="close" size={14} />
              </button>
            )}
          </label>
        </header>

        <div class="g-filters">
          <div class="g-chips" role="group" aria-label="Categories">
            {[
              { id: "all", label: "All" },
              { id: "featured", label: "Featured" },
              { id: "favorites", label: `Favorites${prefs.favorites.length ? ` · ${prefs.favorites.length}` : ""}` },
              { id: "recent", label: "Recently played" },
              ...categories,
            ].map((c) => (
              <button key={c.id} class="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <select class="select g-sort" aria-label="Sort" value={prefs.sort} onChange={(e) => (gamePrefs.value = { ...gamePrefs.peek(), sort: e.currentTarget.value as "featured" })}>
            <option value="featured">Featured first</option>
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
          </select>
        </div>

        {error && (
          <div class="empty">
            <Icon name="wifiOff" size={28} />
            <p>Couldn't load the game library: {error}</p>
            <button class="btn" onClick={fetchCatalog}>
              Try again
            </button>
          </div>
        )}
        {!games && !error && (
          <div class="g-grid">
            {Array.from({ length: 12 }, (_, i) => (
              <div class="g-card skeleton" key={i} />
            ))}
          </div>
        )}

        {games && category === "all" && !query && recent.length > 0 && (
          <section class="g-section">
            <h2>Continue playing</h2>
            <div class="g-row">
              {recent.map((g) => (
                <GameCard key={g.id} game={g} onPlay={setPlaying} />
              ))}
            </div>
          </section>
        )}

        {games && (
          <section class="g-section">
            {category === "all" && !query && recent.length > 0 && <h2>All games</h2>}
            {filtered.length ? (
              <div class="g-grid">
                {filtered.slice(0, limit).map((g) => (
                  <GameCard key={g.id} game={g} onPlay={setPlaying} />
                ))}
              </div>
            ) : (
              <div class="empty">
                <Icon name={category === "favorites" ? "heart" : "search"} size={28} />
                <p>{category === "favorites" ? "Tap the heart on a game to save it here." : category === "recent" ? "Games you play will show up here." : `No games match “${query}”.`}</p>
              </div>
            )}
            {filtered.length > limit && <div ref={sentinel} class="g-sentinel" />}
          </section>
        )}

        <footer class="g-credits hint">
          Games come from the community project{" "}
          <a href="#" onClick={(e) => (e.preventDefault(), newTab("https://github.com/gn-math"))}>
            gn-math
          </a>
          . NOVA loads each game on demand from that project's repository and does not host or redistribute them. Every game belongs to its creator, credited on its page.
        </footer>
      </div>
    </div>
  );
}
