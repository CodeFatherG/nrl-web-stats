/**
 * D1SupplementaryStatsRepository — persists supplementary player stats from nrlsupercoachstats.com to D1.
 * Provides save, query, cache check, and force re-fetch support.
 */

import type { SupplementaryPlayerStats } from '../../domain/ports/supplementary-stats-source.js';

export class D1SupplementaryStatsRepository {
  constructor(private readonly db: D1Database) {}

  async save(stats: SupplementaryPlayerStats[], season: number, round: number): Promise<void> {
    if (stats.length === 0) return;

    const statements: D1PreparedStatement[] = [];

    for (const stat of stats) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO supplementary_stats (
              player_name, season, round,
              last_touch, missed_goals, missed_field_goals,
              effective_offloads, ineffective_offloads,
              runs_over_8m, runs_under_8m,
              try_saves, kick_regather_break, held_up_in_goal,
              price, break_even, team_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_name, season, round) DO UPDATE SET
              last_touch = excluded.last_touch,
              missed_goals = excluded.missed_goals,
              missed_field_goals = excluded.missed_field_goals,
              effective_offloads = excluded.effective_offloads,
              ineffective_offloads = excluded.ineffective_offloads,
              runs_over_8m = excluded.runs_over_8m,
              runs_under_8m = excluded.runs_under_8m,
              try_saves = excluded.try_saves,
              kick_regather_break = excluded.kick_regather_break,
              held_up_in_goal = excluded.held_up_in_goal,
              price = excluded.price,
              break_even = excluded.break_even,
              team_code = excluded.team_code`
          )
          .bind(
            stat.playerName,
            season,
            round,
            stat.lastTouch,
            stat.missedGoals,
            stat.missedFieldGoals,
            stat.effectiveOffloads,
            stat.ineffectiveOffloads,
            stat.runsOver8m,
            stat.runsUnder8m,
            stat.trySaves,
            stat.kickRegatherBreak,
            stat.heldUpInGoal,
            stat.price,
            stat.breakEven,
            stat.teamCode
          )
      );
    }

    await this.db.batch(statements);
  }

  async findByRound(season: number, round: number): Promise<SupplementaryPlayerStats[]> {
    const result = await this.db
      .prepare(
        `SELECT player_name, season, round,
          last_touch, missed_goals, missed_field_goals,
          effective_offloads, ineffective_offloads,
          runs_over_8m, runs_under_8m,
          try_saves, kick_regather_break, held_up_in_goal,
          price, break_even, team_code
        FROM supplementary_stats
        WHERE season = ? AND round = ?
        ORDER BY player_name`
      )
      .bind(season, round)
      .all<{
        player_name: string;
        season: number;
        round: number;
        last_touch: number;
        missed_goals: number;
        missed_field_goals: number;
        effective_offloads: number;
        ineffective_offloads: number;
        runs_over_8m: number;
        runs_under_8m: number;
        try_saves: number;
        kick_regather_break: number;
        held_up_in_goal: number;
        price: number | null;
        break_even: number | null;
        team_code: string | null;
      }>();

    return (result.results ?? []).map(row => ({
      playerName: row.player_name,
      season: row.season,
      round: row.round,
      lastTouch: row.last_touch,
      missedGoals: row.missed_goals,
      missedFieldGoals: row.missed_field_goals,
      effectiveOffloads: row.effective_offloads,
      ineffectiveOffloads: row.ineffective_offloads,
      runsOver8m: row.runs_over_8m,
      runsUnder8m: row.runs_under_8m,
      trySaves: row.try_saves,
      kickRegatherBreak: row.kick_regather_break,
      heldUpInGoal: row.held_up_in_goal,
      price: row.price ?? null,
      breakEven: row.break_even ?? null,
      teamCode: row.team_code ?? null,
    }));
  }

  async isRoundCached(season: number, round: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        'SELECT COUNT(*) as count FROM supplementary_stats WHERE season = ? AND round = ?'
      )
      .bind(season, round)
      .first<{ count: number }>();

    return (row?.count ?? 0) > 0;
  }

  /** Find all (season, round) pairs where any row has null price or break_even (migration backfill). */
  async findRoundsWithNullPriceBreakEven(): Promise<Array<{ year: number; round: number }>> {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT season, round
        FROM supplementary_stats
        WHERE price IS NULL OR break_even IS NULL
        ORDER BY season, round`
      )
      .all<{ season: number; round: number }>();

    return (result.results ?? []).map(row => ({
      year: row.season,
      round: row.round,
    }));
  }

  /** Find all (season, round) pairs where any row has null team_code (migration backfill). */
  async findRoundsWithNullTeamCode(): Promise<Array<{ year: number; round: number }>> {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT season, round
        FROM supplementary_stats
        WHERE team_code IS NULL
        ORDER BY season, round`
      )
      .all<{ season: number; round: number }>();

    return (result.results ?? []).map(row => ({
      year: row.season,
      round: row.round,
    }));
  }

  async deleteRound(season: number, round: number): Promise<void> {
    await this.db
      .prepare('DELETE FROM supplementary_stats WHERE season = ? AND round = ?')
      .bind(season, round)
      .run();
  }
}
