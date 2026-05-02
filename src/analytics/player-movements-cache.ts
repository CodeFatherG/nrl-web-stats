import type { PlayerMovementsResult } from '../domain/player-movements.js';

export class PlayerMovementsCache {
  private readonly store = new Map<string, PlayerMovementsResult>();

  private key(year: number, round: number): string {
    return `${year}:${round}`;
  }

  get(year: number, round: number): PlayerMovementsResult | null {
    return this.store.get(this.key(year, round)) ?? null;
  }

  set(year: number, round: number, result: PlayerMovementsResult): void {
    this.store.set(this.key(year, round), result);
  }

  invalidate(year: number, round: number): void {
    this.store.delete(this.key(year, round));
  }

  getMostRecentCachedRound(year: number): number | null {
    let max: number | null = null;
    for (const key of this.store.keys()) {
      const [keyYear, keyRound] = key.split(':').map(Number);
      if (keyYear === year && (max === null || keyRound > max)) {
        max = keyRound;
      }
    }
    return max;
  }
}

export const playerMovementsCache = new PlayerMovementsCache();
