/**
 * Contract tests for team list API endpoints (T018)
 * - GET /api/matches/:matchId (with/without team list data)
 * - POST /api/scrape/team-lists
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import * as fs from 'fs';
import * as path from 'path';

describe('Team List API contracts', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    const migrationFiles = [
      '0001_create_player_tables.sql',
      '0002_create_matches_table.sql',
      '0003_add_strength_ratings.sql',
      '0004_create_supplementary_stats.sql',
      '0006_add_price_breakeven.sql',
      '0007_create_player_name_links.sql',
      '0008_add_team_code_to_supplementary_stats.sql',
      '0009_create_team_lists.sql',
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

    const db = await mf.getD1Database('DB');
    const statements = migrationSql
      .split(/;\s*\n/)
      .map(s => s.replace(/--.*$/gm, '').trim())
      .filter(s => s.length > 0);
    const prepared = statements.map(s => db.prepare(s));
    await db.batch(prepared);

    // Insert a test match
    await db.prepare(
      `INSERT INTO matches (id, year, round, home_team_code, away_team_code, home_score, away_score, status, scheduled_time, stadium, weather)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('2026-R5-BRO-MEL', 2026, 5, 'BRO', 'MEL', 24, 18, 'Completed', '2026-04-05T08:00:00Z', 'Suncorp Stadium', 'Fine').run();
  });

  afterAll(async () => {
    await mf.dispose();
  });

  describe('GET /api/matches/:matchId', () => {
    it('returns null team lists when no team list data exists', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/matches/2026-R5-BRO-MEL');
      expect(response.status).toBe(200);

      const data = await response.json() as Record<string, unknown>;
      expect(data.homeTeamList).toBeNull();
      expect(data.awayTeamList).toBeNull();
    });

    it('returns team list data after insertion', async () => {
      // Insert team list rows directly
      const db = await mf.getD1Database('DB');
      const members = Array.from({ length: 17 }, (_, i) => ({
        jersey: i + 1,
        name: `Home Player ${i + 1}`,
        position: i < 13 ? 'Forward' : 'Interchange',
        playerId: 2000 + i,
      }));

      const insertStmts = members.map(m =>
        db.prepare(
          `INSERT INTO team_lists (match_id, team_code, year, round, jersey_number, player_name, position, player_id, scraped_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind('2026-R5-BRO-MEL', 'BRO', 2026, 5, m.jersey, m.name, m.position, m.playerId, '2026-04-01T06:00:00Z')
      );
      await db.batch(insertStmts);

      const response = await mf.dispatchFetch('http://localhost/api/matches/2026-R5-BRO-MEL');
      expect(response.status).toBe(200);

      const data = await response.json() as Record<string, unknown>;
      expect(data.homeTeamList).not.toBeNull();
      expect(data.awayTeamList).toBeNull(); // away team not inserted

      const homeTeamList = data.homeTeamList as { teamCode: string; members: Array<{ jerseyNumber: number; playerName: string; position: string }> };
      expect(homeTeamList.teamCode).toBe('BRO');
      expect(homeTeamList.members).toHaveLength(17);
      expect(homeTeamList.members[0].jerseyNumber).toBe(1);
      expect(homeTeamList.members[0].playerName).toBe('Home Player 1');
    });
  });

  describe('POST /api/scrape/team-lists', () => {
    it('returns 400 for missing year', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/scrape/team-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid year', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/scrape/team-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 1990 }),
      });

      expect(response.status).toBe(400);
    });

    it('accepts valid year and optional round', async () => {
      // This will fail to fetch from nrl.com in test (no network), but should not return 400
      const response = await mf.dispatchFetch('http://localhost/api/scrape/team-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: 2026, round: 5 }),
      });

      // Should not be a validation error
      expect(response.status).not.toBe(400);
    });
  });
});
