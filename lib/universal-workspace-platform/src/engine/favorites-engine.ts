import type { WorkspaceFavorite } from "../types/favorites-types.js";
import { MOCK_FAVORITES } from "../mock/mock-favorites.js";

export class FavoritesEngine {
  private favorites: WorkspaceFavorite[];

  constructor(seed?: WorkspaceFavorite[]) {
    this.favorites = seed ?? [...MOCK_FAVORITES];
  }

  list(): WorkspaceFavorite[] {
    return [...this.favorites].sort(
      (a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime(),
    );
  }

  pin(item: Omit<WorkspaceFavorite, "pinnedAt">): WorkspaceFavorite {
    const fav: WorkspaceFavorite = { ...item, pinnedAt: new Date().toISOString() };
    this.favorites = [fav, ...this.favorites.filter((f) => f.id !== item.id)];
    return fav;
  }

  unpin(id: string): void {
    this.favorites = this.favorites.filter((f) => f.id !== id);
  }

  isPinned(id: string): boolean {
    return this.favorites.some((f) => f.id === id);
  }
}

export const favoritesEngine = new FavoritesEngine();
