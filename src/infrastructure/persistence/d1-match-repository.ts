/**
 * D1MatchRepository — implements MatchRepository using Cloudflare D1.
 * Provides persistent storage for Match aggregates with conditional upsert
 * logic that protects completed matches from overwrites.
 */

import type { Match, MatchStatus } from '../../domain/match.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import { logger } from '../../utils/logger.js';

/** Status ordering for forward-only transitions */
const STATUS_ORDER: Record<string, number> = {
  Scheduled: 0,
  InProgress: 1,
  Completed: 2,
};

/** Map a D1 row to a Match domain object */
function rowToMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    year: row.year as number,
    round: row.round as number,
    homeTeamCode: (row.home_team_code as string) ?? null,
    awayTeamCode: (row.away_team_code as string) ?? null,
    homeStrengthRating: (row.home_strength_rating as number) ?? null,
    awayStrengthRating: (row.away_strength_rating as number) ?? null,
    homeScore: (row.home_score as number) ?? null,
    awayScore: (row.away_score as number) ?? null,
    status: (row.status as MatchStatus) ?? 'Scheduled',
    scheduledTime: (row.scheduled_time as string) ?? null,
    stadium: (row.stadium as string) ?? null,
    weather: (row.weather as string) ?? null,
  };
}

export class D1MatchRepository implements MatchRepository {
  constructor(private readonly db: D1Database) {}

  async save(match: Match): Promise<void> {
    try {
      // Upsert with conditional logic:
      // - Always insert if new
      // - If existing and NOT Completed: update all mutable fields, enforce forward-only status
      // - If existing and Completed: only fill null schedule fields (scheduled_time, stadium)
      await this.db
        .prepare(
          `INSERT INTO matches (id, year, round, home_team_code, away_team_code, home_score, away_score, status, scheduled_time, stadium, weather, home_strength_rating, away_strength_rating, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             home_team_code = COALESCE(matches.home_team_code, excluded.home_team_code),
             away_team_code = COALESCE(matches.away_team_code, excluded.away_team_code),
             home_score = CASE
               WHEN matches.status = 'Completed' THEN matches.home_score
               ELSE COALESCE(excluded.home_score, matches.home_score)
             END,
             away_score = CASE
               WHEN matches.status = 'Completed' THEN matches.away_score
               ELSE COALESCE(excluded.away_score, matches.away_score)
             END,
             status = CASE
               WHEN matches.status = 'Completed' THEN matches.status
               WHEN ${STATUS_ORDER['Completed']} >= 0 THEN
                 CASE
                   WHEN excluded.status = 'Completed' THEN 'Completed'
                   WHEN excluded.status = 'InProgress' AND matches.status != 'Completed' THEN 'InProgress'
                   ELSE matches.status
                 END
               ELSE matches.status
             END,
             scheduled_time = COALESCE(matches.scheduled_time, excluded.scheduled_time),
             stadium = COALESCE(matches.stadium, excluded.stadium),
             weather = CASE
               WHEN matches.status = 'Completed' THEN matches.weather
               ELSE COALESCE(excluded.weather, matches.weather)
             END,
             home_strength_rating = CASE
               WHEN matches.status = 'Completed' THEN matches.home_strength_rating
               ELSE COALESCE(excluded.home_strength_rating, matches.home_strength_rating)
             END,
             away_strength_rating = CASE
               WHEN matches.status = 'Completed' THEN matches.away_strength_rating
               ELSE COALESCE(excluded.away_strength_rating, matches.away_strength_rating)
             END,
             updated_at = CASE
               WHEN matches.status = 'Completed'
                 AND matches.scheduled_time IS NOT NULL
                 AND matches.stadium IS NOT NULL
               THEN matches.updated_at
               ELSE datetime('now')
             END`
        )
        .bind(
          match.id,
          match.year,
          match.round,
          match.homeTeamCode,
          match.awayTeamCode,
          match.homeScore,
          match.awayScore,
          match.status,
          match.scheduledTime,
          match.stadium,
          match.weather,
          match.homeStrengthRating,
          match.awayStrengthRating
        )
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to save match to D1', { matchId: match.id, error: message });
    }
  }

  async saveAll(matches: Match[]): Promise<void> {
    if (matches.length === 0) return;

    try {
      // D1 batch limit is ~100 statements; chunk if needed
      const BATCH_SIZE = 50;
      for (let i = 0; i < matches.length; i += BATCH_SIZE) {
        const chunk = matches.slice(i, i + BATCH_SIZE);
        const statements = chunk.map((match) =>
          this.db
            .prepare(
              `INSERT INTO matches (id, year, round, home_team_code, away_team_code, home_score, away_score, status, scheduled_time, stadium, weather, home_strength_rating, away_strength_rating, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
               ON CONFLICT(id) DO UPDATE SET
                 home_team_code = COALESCE(matches.home_team_code, excluded.home_team_code),
                 away_team_code = COALESCE(matches.away_team_code, excluded.away_team_code),
                 home_score = CASE
                   WHEN matches.status = 'Completed' THEN matches.home_score
                   ELSE COALESCE(excluded.home_score, matches.home_score)
                 END,
                 away_score = CASE
                   WHEN matches.status = 'Completed' THEN matches.away_score
                   ELSE COALESCE(excluded.away_score, matches.away_score)
                 END,
                 status = CASE
                   WHEN matches.status = 'Completed' THEN matches.status
                   WHEN excluded.status = 'Completed' THEN 'Completed'
                   WHEN excluded.status = 'InProgress' AND matches.status != 'Completed' THEN 'InProgress'
                   ELSE matches.status
                 END,
                 scheduled_time = COALESCE(matches.scheduled_time, excluded.scheduled_time),
                 stadium = COALESCE(matches.stadium, excluded.stadium),
                 weather = CASE
                   WHEN matches.status = 'Completed' THEN matches.weather
                   ELSE COALESCE(excluded.weather, matches.weather)
                 END,
                 home_strength_rating = CASE
                   WHEN matches.status = 'Completed' THEN matches.home_strength_rating
                   ELSE COALESCE(excluded.home_strength_rating, matches.home_strength_rating)
                 END,
                 away_strength_rating = CASE
                   WHEN matches.status = 'Completed' THEN matches.away_strength_rating
                   ELSE COALESCE(excluded.away_strength_rating, matches.away_strength_rating)
                 END,
                 updated_at = CASE
                   WHEN matches.status = 'Completed'
                     AND matches.scheduled_time IS NOT NULL
                     AND matches.stadium IS NOT NULL
                   THEN matches.updated_at
                   ELSE datetime('now')
                 END`
            )
            .bind(
              match.id,
              match.year,
              match.round,
              match.homeTeamCode,
              match.awayTeamCode,
              match.homeScore,
              match.awayScore,
              match.status,
              match.scheduledTime,
              match.stadium,
              match.weather,
              match.homeStrengthRating,
              match.awayStrengthRating
            )
        );
        await this.db.batch(statements);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to batch save matches to D1', {
        matchCount: matches.length,
        error: message,
      });
    }
  }

  async findById(id: string): Promise<Match | null> {
    const row = await this.db
      .prepare('SELECT * FROM matches WHERE id = ?')
      .bind(id)
      .first();
    return row ? rowToMatch(row) : null;
  }

  async findByYear(year: number): Promise<Match[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM matches WHERE year = ?')
      .bind(year)
      .all();
    return results.map(rowToMatch);
  }

  async findByYearAndRound(year: number, round: number): Promise<Match[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM matches WHERE year = ? AND round = ?')
      .bind(year, round)
      .all();
    return results.map(rowToMatch);
  }

  async findByTeam(teamCode: string, year?: number): Promise<Match[]> {
    if (year !== undefined) {
      const { results } = await this.db
        .prepare(
          'SELECT * FROM matches WHERE (home_team_code = ? OR away_team_code = ?) AND year = ?'
        )
        .bind(teamCode, teamCode, year)
        .all();
      return results.map(rowToMatch);
    }
    const { results } = await this.db
      .prepare('SELECT * FROM matches WHERE home_team_code = ? OR away_team_code = ?')
      .bind(teamCode, teamCode)
      .all();
    return results.map(rowToMatch);
  }

  async getLoadedYears(): Promise<number[]> {
    const { results } = await this.db
      .prepare('SELECT DISTINCT year FROM matches ORDER BY year ASC')
      .all();
    return results.map((r) => r.year as number);
  }

  async isYearLoaded(year: number): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 FROM matches WHERE year = ? LIMIT 1')
      .bind(year)
      .first();
    return row !== null;
  }

  async getMatchCount(): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) as count FROM matches')
      .first();
    return (row?.count as number) ?? 0;
  }
}
