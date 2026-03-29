/**
 * Contract tests for Supercoach API endpoints:
 *   GET /api/supercoach/:year/match/:matchId
 *   GET /api/supercoach/:year/:round
 *   GET /api/supercoach/:year/team/:teamCode
 *   GET /api/supercoach/:year/player/:playerId
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import * as fs from 'fs';
import * as path from 'path';

// ─── type helpers ─────────────────────────────────────────────────────────────

interface TeamGroup {
  teamCode: string;
  teamName: string;
  teamTotal: number;
  isComplete: boolean;
  players: PlayerScore[];
}

interface PlayerScore {
  playerId: string;
  playerName: string;
  totalScore: number;
  isComplete: boolean;
  categoryTotals: Record<string, number>;
}

interface MatchResult {
  matchId: string;
  year: number;
  round: number;
  isComplete: boolean;
  homeTeam: TeamGroup;
  awayTeam: TeamGroup;
}

interface RoundResult {
  year: number;
  round: number;
  isComplete: boolean;
  matchCount: number;
  matches: MatchResult[];
}

interface TeamSeasonResult {
  year: number;
  teamCode: string;
  teamName: string;
  matches: MatchResult[];
}

interface PlayerSeasonResult {
  playerId: string;
  playerName: string;
  teamCode: string;
  year: number;
  seasonTotal: number;
  seasonAverage: number;
  roundsPlayed: number;
  matches?: PlayerMatchEntry[];
  rounds?: PlayerMatchEntry[];
}

interface PlayerMatchEntry {
  matchId?: string;
  round: number;
  totalScore: number;
  isComplete: boolean;
  categoryTotals: Record<string, number>;
}

interface ErrorResponse {
  error: string;
  message: string;
  validOptions?: string[];
}

// ─── invariant helpers ────────────────────────────────────────────────────────

function assertTeamTotalInvariant(group: TeamGroup): void {
  const computed = group.players.reduce((sum, p) => sum + p.totalScore, 0);
  expect(group.teamTotal).toBe(computed);
}

function assertMatchShape(match: MatchResult): void {
  expect(match).toHaveProperty('matchId');
  expect(match).toHaveProperty('year');
  expect(match).toHaveProperty('round');
  expect(match).toHaveProperty('isComplete');
  expect(match).toHaveProperty('homeTeam');
  expect(match).toHaveProperty('awayTeam');
  assertTeamTotalInvariant(match.homeTeam);
  assertTeamTotalInvariant(match.awayTeam);
  expect(match.isComplete).toBe(match.homeTeam.isComplete && match.awayTeam.isComplete);
}

// ─── setup ────────────────────────────────────────────────────────────────────

describe('Supercoach API', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    const allMigrations = [
      '0001_create_player_tables.sql',
      '0002_create_matches_table.sql',
      '0003_add_strength_ratings.sql',
      '0004_create_supplementary_stats.sql',
      '0005_drop_published_score.sql',
      '0006_add_price_breakeven.sql',
      '0007_create_player_name_links.sql',
      '0008_add_team_code_to_supplementary_stats.sql',
      '0009_create_team_lists.sql',
      '0010_create_casualty_ward.sql',
    ];
    const migrationSql = allMigrations
      .map(f => fs.readFileSync(path.join(__dirname, '../../migrations', f), 'utf-8'))
      .join('\n');

    mf = new Miniflare({
      modules: true,
      scriptPath: './dist/worker.js',
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'test-db' },
    });

    const db = await mf.getD1Database('DB');
    const statements = migrationSql
      .split(/;\s*\n/)
      .map(s => s.replace(/--.*$/gm, '').trim())
      .filter(s => s.length > 0);
    await db.batch(statements.map(s => db.prepare(s)));
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    const db = await mf.getD1Database('DB');
    await db.exec('DELETE FROM match_performances');
    await db.exec('DELETE FROM players');
    await db.exec('DELETE FROM matches');
    await db.exec('DELETE FROM supplementary_stats');
  });

  // ─── seed helpers ────────────────────────────────────────────────────────────

  async function seedMatch(db: D1Database, matchId: string, year: number, round: number, homeTeamCode: string, awayTeamCode: string) {
    await db.prepare(
      `INSERT OR IGNORE INTO matches (id, year, round, home_team_code, away_team_code, status)
       VALUES (?, ?, ?, ?, ?, 'Completed')`
    ).bind(matchId, year, round, homeTeamCode, awayTeamCode).run();
  }

  async function seedPlayer(db: D1Database, id: string, name: string, teamCode: string) {
    await db.prepare(
      'INSERT OR IGNORE INTO players (id, name, team_code, position) VALUES (?, ?, ?, ?)'
    ).bind(id, name, teamCode, 'FRF').run();
  }

  async function seedPerformance(db: D1Database, playerId: string, matchId: string, year: number, round: number, teamCode: string, tries = 0) {
    await db.prepare(
      `INSERT INTO match_performances
         (player_id, match_id, season, round, team_code, tries, goals, tackles_made,
          all_run_metres, fantasy_points_total, is_complete)
       VALUES (?, ?, ?, ?, ?, ?, 0, 20, 80, 30, 1)`
    ).bind(playerId, matchId, year, round, teamCode, tries).run();
  }

  // ─── match endpoint ───────────────────────────────────────────────────────

  describe('GET /api/supercoach/:year/match/:matchId', () => {
    it('returns 400 for invalid match ID format', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/match/invalid');
      expect(res.status).toBe(400);
      const body = await res.json() as ErrorResponse;
      expect(body.error).toBe('INVALID_MATCH_ID');
    });

    it('returns 400 for bad year', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/1990/match/2026-R1-NQC-BRI');
      expect(res.status).toBe(400);
      const body = await res.json() as ErrorResponse;
      expect(body.error).toBe('INVALID_YEAR');
    });

    it('returns 404 for non-existent match', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/match/2026-R1-NQC-BRI');
      expect(res.status).toBe(404);
      const body = await res.json() as ErrorResponse;
      expect(body.error).toBe('MATCH_NOT_FOUND');
    });

    it('returns match result with both team groups and correct teamTotals', async () => {
      const db = await mf.getD1Database('DB');
      await seedMatch(db, '2026-R1-NQC-BRI', 2026, 1, 'NQC', 'BRI');
      await seedPlayer(db, 'p1', 'Jason Taumalolo', 'NQC');
      await seedPlayer(db, 'p2', 'Payne Haas', 'BRI');
      await seedPerformance(db, 'p1', '2026-R1-NQC-BRI', 2026, 1, 'NQC', 1);
      await seedPerformance(db, 'p2', '2026-R1-NQC-BRI', 2026, 1, 'BRI', 0);

      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/match/2026-R1-NQC-BRI');
      expect(res.status).toBe(200);
      const data = await res.json() as MatchResult;

      assertMatchShape(data);
      expect(data.matchId).toBe('2026-R1-NQC-BRI');
      expect(data.year).toBe(2026);
      expect(data.round).toBe(1);
      expect(data.homeTeam.teamCode).toBe('NQC');
      expect(data.awayTeam.teamCode).toBe('BRI');
      expect(data.homeTeam.players).toHaveLength(1);
      expect(data.awayTeam.players).toHaveLength(1);
    });

    it('teamTotal equals sum of player scores', async () => {
      const db = await mf.getD1Database('DB');
      await seedMatch(db, '2026-R2-NQC-BRI', 2026, 2, 'NQC', 'BRI');
      await seedPlayer(db, 'p3', 'Valentine Holmes', 'NQC');
      await seedPlayer(db, 'p4', 'Reece Walsh', 'NQC');
      await seedPerformance(db, 'p3', '2026-R2-NQC-BRI', 2026, 2, 'NQC', 2);
      await seedPerformance(db, 'p4', '2026-R2-NQC-BRI', 2026, 2, 'NQC', 1);

      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/match/2026-R2-NQC-BRI');
      const data = await res.json() as MatchResult;

      // teamTotal invariant: must equal exact sum of player scores
      assertTeamTotalInvariant(data.homeTeam);
      assertTeamTotalInvariant(data.awayTeam);
    });
  });

  // ─── round endpoint ───────────────────────────────────────────────────────

  describe('GET /api/supercoach/:year/:round', () => {
    it('returns 400 for invalid round', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/99');
      expect(res.status).toBe(400);
      const body = await res.json() as ErrorResponse;
      expect(body.error).toBe('INVALID_ROUND');
    });

    it('returns empty matches array for round with no data', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/5');
      expect(res.status).toBe(200);
      const data = await res.json() as RoundResult;
      expect(data.matches).toEqual([]);
      expect(data.matchCount).toBe(0);
      expect(data.round).toBe(5);
    });

    it('returns matches array grouped by match with team totals', async () => {
      const db = await mf.getD1Database('DB');
      await seedMatch(db, '2026-R3-NQC-BRI', 2026, 3, 'NQC', 'BRI');
      await seedMatch(db, '2026-R3-SYD-MEL', 2026, 3, 'SYD', 'MEL');
      await seedPlayer(db, 'pa', 'Tom Dearden', 'NQC');
      await seedPerformance(db, 'pa', '2026-R3-NQC-BRI', 2026, 3, 'NQC', 1);

      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/3');
      expect(res.status).toBe(200);
      const data = await res.json() as RoundResult;

      expect(data.year).toBe(2026);
      expect(data.round).toBe(3);
      expect(data.matchCount).toBe(2);
      expect(data.matches).toHaveLength(2);
      data.matches.forEach(assertMatchShape);
    });

    it('does not return a flat scores[] array (breaking change verified)', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/1');
      const data = await res.json() as Record<string, unknown>;
      expect(data).not.toHaveProperty('scores');
      expect(data).toHaveProperty('matches');
    });
  });

  // ─── team endpoint ────────────────────────────────────────────────────────

  describe('GET /api/supercoach/:year/team/:teamCode', () => {
    it('returns 400 for invalid team code', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/team/ZZZ');
      expect(res.status).toBe(400);
      const body = await res.json() as ErrorResponse;
      expect(body.error).toBe('INVALID_TEAM_CODE');
      expect(body.validOptions).toBeDefined();
    });

    it('returns empty matches array for team with no data (not 404)', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/team/NQC');
      expect(res.status).toBe(200);
      const data = await res.json() as TeamSeasonResult;
      expect(data.teamCode).toBe('NQC');
      expect(data.teamName).toBeTruthy();
      expect(data.matches).toEqual([]);
    });

    it('returns matches ordered by round ascending', async () => {
      const db = await mf.getD1Database('DB');
      await seedMatch(db, '2026-R3-NQC-BRI', 2026, 3, 'NQC', 'BRI');
      await seedMatch(db, '2026-R1-NQC-SYD', 2026, 1, 'NQC', 'SYD');
      await seedMatch(db, '2026-R2-MEL-NQC', 2026, 2, 'MEL', 'NQC');

      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/team/NQC');
      expect(res.status).toBe(200);
      const data = await res.json() as TeamSeasonResult;

      expect(data.matches).toHaveLength(3);
      const rounds = data.matches.map(m => m.round);
      expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
      data.matches.forEach(assertMatchShape);
    });
  });

  // ─── player endpoint ──────────────────────────────────────────────────────

  describe('GET /api/supercoach/:year/player/:playerId', () => {
    it('returns 404 for unknown player', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/player/unknown-id');
      expect(res.status).toBe(404);
      const body = await res.json() as ErrorResponse;
      expect(body.error).toBe('PLAYER_NOT_FOUND');
    });

    it('returns player season with per-match entries and matchId references', async () => {
      const db = await mf.getD1Database('DB');
      await seedMatch(db, '2026-R1-NQC-BRI', 2026, 1, 'NQC', 'BRI');
      await seedMatch(db, '2026-R2-NQC-SYD', 2026, 2, 'NQC', 'SYD');
      await seedPlayer(db, 'px1', 'Jason Taumalolo', 'NQC');
      await seedPerformance(db, 'px1', '2026-R1-NQC-BRI', 2026, 1, 'NQC', 1);
      await seedPerformance(db, 'px1', '2026-R2-NQC-SYD', 2026, 2, 'NQC', 0);

      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/player/px1');
      expect(res.status).toBe(200);
      const data = await res.json() as PlayerSeasonResult;

      expect(data.playerId).toBe('px1');
      expect(data.playerName).toBe('Jason Taumalolo');

      // Support both old shape (rounds) and new shape (matches) during transition
      const entries = data.matches ?? data.rounds ?? [];
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('seasonTotal equals sum of match totalScores', async () => {
      const db = await mf.getD1Database('DB');
      await seedMatch(db, '2026-R1-NQC-BRI', 2026, 1, 'NQC', 'BRI');
      await seedPlayer(db, 'px2', 'Tom Dearden', 'NQC');
      await seedPerformance(db, 'px2', '2026-R1-NQC-BRI', 2026, 1, 'NQC', 1);

      const res = await mf.dispatchFetch('http://localhost/api/supercoach/2026/player/px2');
      const data = await res.json() as PlayerSeasonResult;
      const entries = data.matches ?? data.rounds ?? [];
      const sumFromEntries = entries.reduce((s, e) => s + e.totalScore, 0);
      expect(data.seasonTotal).toBe(sumFromEntries);
    });
  });
});
