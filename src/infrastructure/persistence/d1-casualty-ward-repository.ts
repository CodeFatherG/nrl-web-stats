/**
 * D1CasualtyWardRepository — implements CasualtyWardRepository using Cloudflare D1.
 * Provides persistent storage for casualty ward injury records.
 */

import type { CasualtyWardEntry } from '../../domain/casualty-ward-entry.js';
import type { CasualtyWardRepository } from '../../domain/repositories/casualty-ward-repository.js';
import { logger } from '../../utils/logger.js';

/** Reconstruct a CasualtyWardEntry from a flat D1 row */
function rowToEntry(row: Record<string, unknown>): CasualtyWardEntry {
  return {
    id: row.id as number,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    teamCode: row.team_code as string,
    injury: row.injury as string,
    expectedReturn: row.expected_return as string,
    startDate: row.start_date as string,
    endDate: (row.end_date as string) ?? null,
    playerId: (row.player_id as string) ?? null,
  };
}

export class D1CasualtyWardRepository implements CasualtyWardRepository {
  constructor(private readonly db: D1Database) {}

  async insert(entry: CasualtyWardEntry): Promise<CasualtyWardEntry> {
    const result = await this.db
      .prepare(
        `INSERT INTO casualty_ward (first_name, last_name, team_code, injury, expected_return, start_date, end_date, player_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         RETURNING *`
      )
      .bind(
        entry.firstName,
        entry.lastName,
        entry.teamCode,
        entry.injury,
        entry.expectedReturn,
        entry.startDate,
        entry.endDate,
        entry.playerId
      )
      .first();

    if (!result) {
      throw new Error('Failed to insert casualty ward entry — no row returned');
    }

    return rowToEntry(result as Record<string, unknown>);
  }

  async update(entry: CasualtyWardEntry): Promise<void> {
    if (entry.id === null) {
      throw new Error('Cannot update casualty ward entry without an id');
    }

    await this.db
      .prepare(
        `UPDATE casualty_ward
         SET injury = ?, expected_return = ?, end_date = ?, player_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(entry.injury, entry.expectedReturn, entry.endDate, entry.playerId, entry.id)
      .run();
  }

  async findOpen(): Promise<CasualtyWardEntry[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM casualty_ward WHERE end_date IS NULL ORDER BY team_code, last_name, first_name')
      .all();

    return (results as Record<string, unknown>[]).map(rowToEntry);
  }

  async findByPlayerId(playerId: string): Promise<CasualtyWardEntry[]> {
    // Primary: direct player_id match
    const { results: direct } = await this.db
      .prepare('SELECT * FROM casualty_ward WHERE player_id = ? ORDER BY start_date DESC')
      .bind(playerId)
      .all();

    // Fallback: name + team match for entries where player_id was never resolved.
    // This happens when the scraper couldn't match the player at insert time (e.g. the
    // player didn't exist in the players table yet, or was closed the same day).
    const { results: nameBased } = await this.db
      .prepare(`
        SELECT cw.* FROM casualty_ward cw
        JOIN players p ON p.id = ?
        WHERE LOWER(TRIM(cw.first_name || ' ' || cw.last_name)) = LOWER(TRIM(p.name))
          AND cw.team_code = p.team_code
          AND cw.player_id IS NULL
        ORDER BY cw.start_date DESC
      `)
      .bind(playerId)
      .all();

    // Self-heal: backfill player_id so future calls hit the fast path
    const nameBasedEntries = (nameBased as Record<string, unknown>[]).map(rowToEntry);
    for (const entry of nameBasedEntries) {
      if (entry.id !== null) {
        await this.db
          .prepare("UPDATE casualty_ward SET player_id = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(playerId, entry.id)
          .run();
        entry.playerId = playerId;
      }
    }

    const all = [
      ...(direct as Record<string, unknown>[]).map(rowToEntry),
      ...nameBasedEntries,
    ];

    // Deduplicate by id in case both queries matched the same row
    const seen = new Set<number>();
    return all.filter(e => {
      if (e.id === null || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  async findAll(): Promise<CasualtyWardEntry[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM casualty_ward ORDER BY start_date DESC')
      .all();

    return (results as Record<string, unknown>[]).map(rowToEntry);
  }

  async close(id: number, endDate: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE casualty_ward SET end_date = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .bind(endDate, id)
      .run();

    logger.info('Closed casualty ward entry', { id, endDate });
  }
}
