/**
 * D1PlayerRepository — implements PlayerRepository using Cloudflare D1.
 * Provides persistent storage for Player aggregates and MatchPerformance records.
 */

import type { PlayerRepository, SeasonAggregates } from '../../domain/repositories/player-repository.js';
import type { Player, MatchPerformance } from '../../domain/player.js';

export class D1PlayerRepository implements PlayerRepository {
  constructor(private readonly db: D1Database) {}

  async save(player: Player): Promise<void> {
    const statements: D1PreparedStatement[] = [];

    // Upsert player
    statements.push(
      this.db
        .prepare(
          `INSERT INTO players (id, name, date_of_birth, team_code, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             team_code = excluded.team_code,
             position = excluded.position,
             updated_at = datetime('now')`
        )
        .bind(player.id, player.name, player.dateOfBirth, player.teamCode, player.position)
    );

    // Upsert each match performance
    for (const perf of player.performances) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO match_performances (player_id, match_id, season, round, team_code, tries, goals, tackles, run_metres, fantasy_points, is_complete, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(player_id, match_id) DO UPDATE SET
               tries = excluded.tries,
               goals = excluded.goals,
               tackles = excluded.tackles,
               run_metres = excluded.run_metres,
               fantasy_points = excluded.fantasy_points,
               is_complete = excluded.is_complete,
               updated_at = datetime('now')
             WHERE excluded.is_complete = 1 OR match_performances.is_complete = 0`
          )
          .bind(
            player.id,
            perf.matchId,
            perf.year,
            perf.round,
            perf.teamCode,
            perf.tries,
            perf.goals,
            perf.tackles,
            perf.runMetres,
            perf.fantasyPoints,
            perf.isComplete ? 1 : 0
          )
      );
    }

    await this.db.batch(statements);
  }

  async findById(id: string): Promise<Player | null> {
    const playerRow = await this.db
      .prepare('SELECT id, name, date_of_birth, team_code, position FROM players WHERE id = ?')
      .bind(id)
      .first<{ id: string; name: string; date_of_birth: string | null; team_code: string; position: string }>();

    if (!playerRow) return null;

    const perfResults = await this.db
      .prepare(
        `SELECT match_id, season, round, team_code, tries, goals, tackles, run_metres, fantasy_points, is_complete
         FROM match_performances WHERE player_id = ? ORDER BY season, round`
      )
      .bind(id)
      .all<{
        match_id: string; season: number; round: number; team_code: string;
        tries: number; goals: number; tackles: number; run_metres: number;
        fantasy_points: number; is_complete: number;
      }>();

    const performances: MatchPerformance[] = (perfResults.results ?? []).map(row => ({
      matchId: row.match_id,
      year: row.season,
      round: row.round,
      teamCode: row.team_code,
      tries: row.tries,
      goals: row.goals,
      tackles: row.tackles,
      runMetres: row.run_metres,
      fantasyPoints: row.fantasy_points,
      isComplete: row.is_complete === 1,
    }));

    return {
      id: playerRow.id,
      name: playerRow.name,
      dateOfBirth: playerRow.date_of_birth,
      teamCode: playerRow.team_code,
      position: playerRow.position,
      performances,
    };
  }

  async findByTeam(teamCode: string, season?: number): Promise<Player[]> {
    let playerIds: string[];

    if (season !== undefined) {
      // Find players who have performances for this team in this season
      const result = await this.db
        .prepare(
          'SELECT DISTINCT player_id FROM match_performances WHERE team_code = ? AND season = ?'
        )
        .bind(teamCode, season)
        .all<{ player_id: string }>();
      playerIds = (result.results ?? []).map(r => r.player_id);
    } else {
      // Find players currently on this team
      const result = await this.db
        .prepare('SELECT id FROM players WHERE team_code = ?')
        .bind(teamCode)
        .all<{ id: string }>();
      playerIds = (result.results ?? []).map(r => r.id);
    }

    const players: Player[] = [];
    for (const id of playerIds) {
      const player = await this.findById(id);
      if (player) {
        if (season !== undefined) {
          // Filter performances to requested season only
          const filtered: Player = {
            ...player,
            performances: player.performances.filter(p => p.year === season),
          };
          players.push(filtered);
        } else {
          players.push(player);
        }
      }
    }

    return players;
  }

  async findMatchPerformances(playerId: string, season: number): Promise<MatchPerformance[]> {
    const result = await this.db
      .prepare(
        `SELECT match_id, season, round, team_code, tries, goals, tackles, run_metres, fantasy_points, is_complete
         FROM match_performances WHERE player_id = ? AND season = ? ORDER BY round`
      )
      .bind(playerId, season)
      .all<{
        match_id: string; season: number; round: number; team_code: string;
        tries: number; goals: number; tackles: number; run_metres: number;
        fantasy_points: number; is_complete: number;
      }>();

    return (result.results ?? []).map(row => ({
      matchId: row.match_id,
      year: row.season,
      round: row.round,
      teamCode: row.team_code,
      tries: row.tries,
      goals: row.goals,
      tackles: row.tackles,
      runMetres: row.run_metres,
      fantasyPoints: row.fantasy_points,
      isComplete: row.is_complete === 1,
    }));
  }

  async findSeasonAggregates(playerId: string, season: number): Promise<SeasonAggregates | null> {
    const row = await this.db
      .prepare(
        `SELECT
           COUNT(*) as matches_played,
           SUM(tries) as total_tries,
           SUM(goals) as total_goals,
           SUM(tackles) as total_tackles,
           SUM(run_metres) as total_run_metres,
           SUM(fantasy_points) as total_fantasy_points
         FROM match_performances
         WHERE player_id = ? AND season = ?`
      )
      .bind(playerId, season)
      .first<{
        matches_played: number; total_tries: number; total_goals: number;
        total_tackles: number; total_run_metres: number; total_fantasy_points: number;
      }>();

    if (!row || row.matches_played === 0) return null;

    return {
      matchesPlayed: row.matches_played,
      totalTries: row.total_tries,
      totalGoals: row.total_goals,
      totalTackles: row.total_tackles,
      totalRunMetres: row.total_run_metres,
      totalFantasyPoints: row.total_fantasy_points,
    };
  }

  async isRoundComplete(season: number, round: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN is_complete = 1 THEN 1 ELSE 0 END) as complete
         FROM match_performances WHERE season = ? AND round = ?`
      )
      .bind(season, round)
      .first<{ total: number; complete: number }>();

    if (!row || row.total === 0) return false;
    return row.total === row.complete;
  }
}
