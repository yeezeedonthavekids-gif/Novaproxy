import { signal, effect } from "@preact/signals";
import { load, save } from "../lib/storage";

export interface RecentGame {
  id: number;
  name: string;
  cover: string;
  playedAt: number;
}

interface GamePrefs {
  favorites: number[];
  recent: RecentGame[];
  category: string;
  sort: "featured" | "az" | "za";
}

export const gamePrefs = signal<GamePrefs>({
  favorites: [],
  recent: [],
  category: "all",
  sort: "featured",
  ...load<Partial<GamePrefs>>("games", {}),
});
effect(() => save("games", gamePrefs.value));

export function toggleFavorite(id: number) {
  const p = gamePrefs.peek();
  gamePrefs.value = { ...p, favorites: p.favorites.includes(id) ? p.favorites.filter((f) => f !== id) : [id, ...p.favorites] };
}

export function markPlayed(game: { id: number; name: string; cover: string }) {
  const p = gamePrefs.peek();
  gamePrefs.value = {
    ...p,
    recent: [{ ...game, playedAt: Date.now() }, ...p.recent.filter((r) => r.id !== game.id)].slice(0, 24),
  };
}

/** A game the Games page should open as soon as it mounts (set from the home widget). */
export const pendingGame = signal<number | null>(null);
