/**
 * Contract tests for player statistics API endpoints.
 * Uses Miniflare with D1 to test the full request/response cycle.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import * as fs from 'fs';
import * as path from 'path';

describe('Player Stats API', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    const migrationFiles = [
      '0001_create_player_tables.sql',
      '0004_create_supplementary_stats.sql',
      '0005_drop_published_score.sql',
      '0006_add_price_breakeven.sql',
      '0007_create_player_name_links.sql',
      '0008_add_team_code_to_supplementary_stats.sql',
    ];
    const migrationSql = migrationFiles
      .map(f => fs.readFileSync(path.join(__dirname, '../../migrations', f), 'utf-8'))
      .join('\n');

    mf = new Miniflare({
      modules: true,
      scriptPath: './dist/worker.js',
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'test-db' },
    });

    // Apply migrations via batch (db.exec doesn't handle multiline SQL)
    const db = await mf.getD1Database('DB');
    const statements = migrationSql
      .split(/;\s*\n/)
      .map(s => s.replace(/--.*$/gm, '').trim())
      .filter(s => s.length > 0);
    const prepared = statements.map(s => db.prepare(s));
    await db.batch(prepared);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(async () => {
    // Clean tables between tests
    const db = await mf.getD1Database('DB');
    await db.exec('DELETE FROM match_performances');
    await db.exec('DELETE FROM players');
    await db.exec('DELETE FROM supplementary_stats');
  });

  async function seedPlayer(db: D1Database, id: string, name: string, teamCode: string, position: string) {
    await db.prepare(
      'INSERT INTO players (id, name, team_code, position) VALUES (?, ?, ?, ?)'
    ).bind(id, name, teamCode, position).run();
  }

  async function seedPerformance(
    db: D1Database,
    playerId: string,
    matchId: string,
    season: number,
    round: number,
    teamCode: string,
    opts: { tries?: number; goals?: number; tacklesMade?: number; allRunMetres?: number; fantasyPointsTotal?: number; isComplete?: number } = {}
  ) {
    await db.prepare(
      `INSERT INTO match_performances (player_id, match_id, season, round, team_code, tries, goals, tackles_made, all_run_metres, fantasy_points_total, is_complete)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      playerId, matchId, season, round, teamCode,
      opts.tries ?? 0, opts.goals ?? 0, opts.tacklesMade ?? 10,
      opts.allRunMetres ?? 50, opts.fantasyPointsTotal ?? 20, opts.isComplete ?? 1
    ).run();
  }

  // ============================================
  // GET /api/players/team/:teamCode
  // ============================================

  describe('GET /api/players/team/:teamCode', () => {
    it('returns 200 with players for valid team code', async () => {
      const db = await mf.getD1Database('DB');
      await seedPlayer(db, '1001', 'Test Player', 'CBR', 'Fullback');
      await seedPerformance(db, '1001', 'match-1', 2025, 1, 'CBR', { tries: 2, tacklesMade: 15 });

      const res = await mf.dispatchFetch('http://localhost/api/players/team/CBR?season=2025');
      expect(res.status).toBe(200);

      const data = await res.json() as { team: string; season: number; players: Array<{ id: string; name: string; seasonStats: { matchesPlayed: number; totalTries: number } }> };
      expect(data.team).toBe('CBR');
      expect(data.season).toBe(2025);
      expect(data.players).toHaveLength(1);
      expect(data.players[0].id).toBe('1001');
      expect(data.players[0].name).toBe('Test Player');
      expect(data.players[0].seasonStats.matchesPlayed).toBe(1);
      expect(data.players[0].seasonStats.totalTries).toBe(2);
    });

    it('returns 200 with empty array when no players found', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/players/team/CBR?season=2025');
      expect(res.status).toBe(200);

      const data = await res.json() as { players: unknown[] };
      expect(data.players).toHaveLength(0);
    });

    it('returns 400 for invalid team code with validOptions', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/players/team/XXX');
      expect(res.status).toBe(400);

      const data = await res.json() as { error: string; message: string; validOptions: string[] };
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('Invalid team code');
      expect(data.validOptions).toBeDefined();
      expect(Array.isArray(data.validOptions)).toBe(true);
    });

    it('returns 400 for invalid season parameter', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/players/team/CBR?season=abc');
      expect(res.status).toBe(400);

      const data = await res.json() as { message: string };
      expect(data.message).toContain('Invalid season');
    });
  });

  // ============================================
  // GET /api/players/:playerId
  // ============================================

  describe('GET /api/players/:playerId', () => {
    it('returns 200 with player data and seasons grouped', async () => {
      const db = await mf.getD1Database('DB');
      await seedPlayer(db, '1001', 'Test Player', 'CBR', 'Fullback');
      await seedPerformance(db, '1001', 'match-1', 2025, 1, 'CBR', { tries: 1, tacklesMade: 20, fantasyPointsTotal: 35 });
      await seedPerformance(db, '1001', 'match-2', 2025, 2, 'CBR', { tries: 0, tacklesMade: 18, fantasyPointsTotal: 28 });

      const res = await mf.dispatchFetch('http://localhost/api/players/1001');
      expect(res.status).toBe(200);

      const data = await res.json() as {
        id: string;
        name: string;
        teamCode: string;
        seasons: Record<string, { matchesPlayed: number; performances: Array<{ round: number }> }>;
      };
      expect(data.id).toBe('1001');
      expect(data.name).toBe('Test Player');
      expect(data.teamCode).toBe('CBR');
      expect(data.seasons['2025']).toBeDefined();
      expect(data.seasons['2025'].matchesPlayed).toBe(2);
      expect(data.seasons['2025'].performances).toHaveLength(2);
    });

    it('returns 404 when player not found', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/players/999999');
      expect(res.status).toBe(404);

      const data = await res.json() as { error: string; message: string };
      expect(data.error).toBe('Not Found');
      expect(data.message).toContain('999999');
    });
  });

  // ============================================
  // POST /api/scrape/players
  // ============================================

  describe('POST /api/scrape/players', () => {
    it('returns 400 for missing fields', async () => {
      const res = await mf.dispatchFetch('http://localhost/api/scrape/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);

      const data = await res.json() as { error: string };
      expect(data.error).toBe('Bad Request');
    });

    it('returns 400 when round is locked by supplementary stats and force is false', async () => {
      const db = await mf.getD1Database('DB');
      // Seed supplementary stats for round 5 — this is the lock signal
      await db.prepare(
        `INSERT INTO supplementary_stats (player_name, season, round, last_touch, missed_goals, missed_field_goals, effective_offloads, ineffective_offloads, runs_over_8m, runs_under_8m, try_saves, kick_regather_break, held_up_in_goal)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`
      ).bind('Smith, John', 2025, 5).run();

      const res = await mf.dispatchFetch('http://localhost/api/scrape/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2025, round: 5 }),
      });
      expect(res.status).toBe(400);

      const data = await res.json() as { message: string };
      expect(data.message).toContain('locked by supplementary stats');
      expect(data.message).toContain('force: true');
    });
  });
});
