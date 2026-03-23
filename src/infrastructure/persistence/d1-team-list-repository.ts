/**
 * D1TeamListRepository — implements TeamListRepository using Cloudflare D1.
 * Provides persistent storage for team list data with replace semantics.
 */

import type { TeamList, SquadMember } from '../../domain/team-list.js';
import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import { logger } from '../../utils/logger.js';

/** Reconstruct TeamList objects from flat D1 rows */
function rowsToTeamLists(rows: Record<string, unknown>[]): TeamList[] {
  // Group rows by (match_id, team_code)
  const grouped = new Map<string, { meta: Record<string, unknown>; members: SquadMember[] }>();

  for (const row of rows) {
    const key = `${row.match_id}::${row.team_code}`;
    if (!grouped.has(key)) {
      grouped.set(key, { meta: row, members: [] });
    }
    grouped.get(key)!.members.push({
      jerseyNumber: row.jersey_number as number,
      playerName: row.player_name as string,
      position: row.position as string,
      playerId: row.player_id as number,
    });
  }

  return Array.from(grouped.values()).map(({ meta, members }) => ({
    matchId: meta.match_id as string,
    teamCode: meta.team_code as string,
    year: meta.year as number,
    round: meta.round as number,
    members: members.sort((a, b) => a.jerseyNumber - b.jerseyNumber),
    scrapedAt: meta.scraped_at as string,
  }));
}

export class D1TeamListRepository implements TeamListRepository {
  constructor(private readonly db: D1Database) {}

  async save(teamList: TeamList): Promise<void> {
    try {
      // Delete existing rows for this match+team, then insert new ones
      const deleteStmt = this.db
        .prepare('DELETE FROM team_lists WHERE match_id = ? AND team_code = ?')
        .bind(teamList.matchId, teamList.teamCode);

      const insertStmts = teamList.members.map((member) =>
        this.db
          .prepare(
            `INSERT INTO team_lists (match_id, team_code, year, round, jersey_number, player_name, position, player_id, scraped_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            teamList.matchId,
            teamList.teamCode,
            teamList.year,
            teamList.round,
            member.jerseyNumber,
            member.playerName,
            member.position,
            member.playerId,
            teamList.scrapedAt
          )
      );

      await this.db.batch([deleteStmt, ...insertStmts]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to save team list to D1', {
        matchId: teamList.matchId,
        teamCode: teamList.teamCode,
        error: message,
      });
    }
  }

  async saveAll(teamLists: TeamList[]): Promise<void> {
    if (teamLists.length === 0) return;

    try {
      // Each team list = 1 delete + N inserts (typically 17-22 players)
      // D1 batch limit ~100 statements, so process max 4 team lists per batch
      const BATCH_SIZE = 4;
      for (let i = 0; i < teamLists.length; i += BATCH_SIZE) {
        const chunk = teamLists.slice(i, i + BATCH_SIZE);
        const statements: D1PreparedStatement[] = [];

        for (const teamList of chunk) {
          statements.push(
            this.db
              .prepare('DELETE FROM team_lists WHERE match_id = ? AND team_code = ?')
              .bind(teamList.matchId, teamList.teamCode)
          );

          for (const member of teamList.members) {
            statements.push(
              this.db
                .prepare(
                  `INSERT INTO team_lists (match_id, team_code, year, round, jersey_number, player_name, position, player_id, scraped_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
                )
                .bind(
                  teamList.matchId,
                  teamList.teamCode,
                  teamList.year,
                  teamList.round,
                  member.jerseyNumber,
                  member.playerName,
                  member.position,
                  member.playerId,
                  teamList.scrapedAt
                )
            );
          }
        }

        await this.db.batch(statements);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to batch save team lists to D1', {
        count: teamLists.length,
        error: message,
      });
    }
  }

  async findByMatch(matchId: string): Promise<TeamList[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM team_lists WHERE match_id = ? ORDER BY team_code, jersey_number')
      .bind(matchId)
      .all();
    return rowsToTeamLists(results as Record<string, unknown>[]);
  }

  async findByYearAndRound(year: number, round: number): Promise<TeamList[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM team_lists WHERE year = ? AND round = ? ORDER BY match_id, team_code, jersey_number')
      .bind(year, round)
      .all();
    return rowsToTeamLists(results as Record<string, unknown>[]);
  }

  async hasTeamList(matchId: string, teamCode: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 FROM team_lists WHERE match_id = ? AND team_code = ? LIMIT 1')
      .bind(matchId, teamCode)
      .first();
    return row !== null;
  }

  async hasTeamListsForMatch(matchId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 FROM team_lists WHERE match_id = ? LIMIT 1')
      .bind(matchId)
      .first();
    return row !== null;
  }
}
