import type { RoundGSR } from '../../domain/game-strength.js';

export class D1GameStrengthRepository {
  constructor(private readonly db: D1Database) {}

  async findByRound(year: number, round: number): Promise<RoundGSR | null> {
    const row = await this.db
      .prepare('SELECT data FROM game_strength_ratings WHERE year = ? AND round = ?')
      .bind(year, round)
      .first<{ data: string }>();
    if (!row) return null;
    return JSON.parse(row.data) as RoundGSR;
  }

  async save(year: number, round: number, gsr: RoundGSR): Promise<void> {
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO game_strength_ratings (year, round, data, locked_at) VALUES (?, ?, ?, ?)'
      )
      .bind(year, round, JSON.stringify(gsr), new Date().toISOString())
      .run();
  }
}
