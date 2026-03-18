/**
 * Contract tests for GET /api/matches/:matchId endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import * as fs from 'fs';
import * as path from 'path';

describe('GET /api/matches/:matchId', () => {
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

    // Apply migrations
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

  it('returns 400 for invalid match ID format', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/matches/invalid-id');
    expect(response.status).toBe(400);
    const data = await response.json() as { error: string; message: string };
    expect(data.error).toBe('Bad Request');
    expect(data.message).toContain('Invalid match ID format');
  });

  it('returns 404 for non-existent match', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/matches/2025-R1-BRI-SYD');
    expect(response.status).toBe(404);
    const data = await response.json() as { error: string; message: string };
    expect(data.error).toBe('Not Found');
    expect(data.message).toContain('Match not found');
  });

  it('returns 400 for match ID with lowercase teams', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/matches/2025-R1-bri-syd');
    expect(response.status).toBe(400);
    const data = await response.json() as { error: string };
    expect(data.error).toBe('Bad Request');
  });

  it('returns 400 for match ID missing round prefix', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/matches/2025-1-BRI-SYD');
    expect(response.status).toBe(400);
    const data = await response.json() as { error: string };
    expect(data.error).toBe('Bad Request');
  });
});
