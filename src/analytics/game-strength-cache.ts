import type { RoundGSR } from '../domain/game-strength.js';

export class GameStrengthCache {
  private readonly store = new Map<string, RoundGSR>();

  private key(year: number, round: number): string {
    return `${year}:${round}`;
  }

  get(year: number, round: number): RoundGSR | undefined {
    return this.store.get(this.key(year, round));
  }

  set(year: number, round: number, gsr: RoundGSR): void {
    this.store.set(this.key(year, round), gsr);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const gameStrengthCache = new GameStrengthCache();
