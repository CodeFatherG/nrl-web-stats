import type { RoundGSR } from '../../domain/game-strength.js';

/**
 * Internal sub-adapter used by `CompositeGameStrengthRepository` to talk
 * to the D1 `game_strength_ratings` table. Callers outside the composite
 * MUST go through the `GameStrengthRepository` port — this class is named
 * after its backend (`D1…`) and therefore violates the FR-015 vocabulary
 * rule if used directly from the application layer.
 */
export interface D1LockedReadResult {
  readonly gsr: RoundGSR;
  readonly lockedAt: string;
}

export class D1GameStrengthRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Read the locked rating + its `locked_at` timestamp for `(year, round)`.
   * Returns `null` if no row exists.
   */
  async findByRound(year: number, round: number): Promise<D1LockedReadResult | null> {
    const row = await this.db
      .prepare('SELECT data, locked_at FROM game_strength_ratings WHERE year = ? AND round = ?')
      .bind(year, round)
      .first<{ data: string; locked_at: string }>();
    if (!row) return null;
    return {
      gsr: JSON.parse(row.data) as RoundGSR,
      lockedAt: row.locked_at,
    };
  }

  async save(year: number, round: number, gsr: RoundGSR): Promise<void> {
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO game_strength_ratings (year, round, data, locked_at) VALUES (?, ?, ?, ?)'
      )
      .bind(year, round, JSON.stringify(gsr), new Date().toISOString())
      .run();
  }

  /**
   * Return the set of rounds for which a locked rating exists in the given
   * year. Used by `EnqueueDueScrapesUseCase` to compute the locked half of
   * the GSR coverage gap-set (spec 036, FR-013 cron discovery path).
   */
  async findLockedRoundsForYear(year: number): Promise<ReadonlySet<number>> {
    const result = await this.db
      .prepare('SELECT round FROM game_strength_ratings WHERE year = ?')
      .bind(year)
      .all<{ round: number }>();
    const rounds = new Set<number>();
    for (const row of result.results ?? []) {
      rounds.add(row.round);
    }
    return rounds;
  }
}
