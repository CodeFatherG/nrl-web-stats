/**
 * Integration tests for GET /api/players/season/:year endpoint.
 * Tests the handler with a real D1 database via Miniflare.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { Hono } from 'hono';
import { D1PlayerRepository } from '../../src/infrastructure/persistence/d1-player-repository.js';
import type { HandlerDeps } from '../../src/api/handlers.js';
import * as handlers from '../../src/api/handlers.js';
import type { D1Database } from '@cloudflare/workers-types';
import type { Player } from '../../src/domain/player.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'test-player-1990-01-01',
    name: 'Test Player',
    dateOfBirth: null,
    teamCode: 'BRO',
    position: 'Fullback',
    performances: [],
    ...overrides,
  };
}

function createMinimalPerformance(overrides: Record<string, unknown> = {}) {
  return {
    matchId: '2026-R1-BRO-MEL',
    year: 2026,
    round: 1,
    teamCode: 'BRO',
    tries: 1,
    goals: 0,
    tacklesMade: 15,
    allRunMetres: 120,
    fantasyPointsTotal: 55.0,
    points: 4,
    tackleBreaks: 3,
    lineBreaks: 1,
    isComplete: true,
    // Zero out remaining fields
    allRuns: 0, bombKicks: 0, crossFieldKicks: 0, conversions: 0, conversionAttempts: 0,
    dummyHalfRuns: 0, dummyHalfRunMetres: 0, dummyPasses: 0, errors: 0, fieldGoals: 0,
    forcedDropOutKicks: 0, fortyTwentyKicks: 0, goalConversionRate: 0, grubberKicks: 0,
    handlingErrors: 0, hitUps: 0, hitUpRunMetres: 0, ineffectiveTackles: 0, intercepts: 0,
    kicks: 0, kicksDead: 0, kicksDefused: 0, kickMetres: 0, kickReturnMetres: 0,
    lineBreakAssists: 0, lineEngagedRuns: 0, minutesPlayed: 80, missedTackles: 0,
    offloads: 0, offsideWithinTenMetres: 0, oneOnOneLost: 0, oneOnOneSteal: 0, onePointFieldGoals: 0,
    onReport: 0, passesToRunRatio: 0, passes: 0, playTheBallTotal: 0, playTheBallAverageSpeed: 0,
    penalties: 0, penaltyGoals: 0, postContactMetres: 0, receipts: 0, ruckInfringements: 0,
    sendOffs: 0, sinBins: 0, stintOne: 0, tackleEfficiency: 0, tryAssists: 0,
    twentyFortyKicks: 0, twoPointFieldGoals: 0,
    ...overrides,
  };
}

describe('GET /api/players/season/:year', () => {
  let mf: Miniflare;
  let db: D1Database;
  let app: Hono;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });

    db = await mf.getD1Database('DB') as unknown as D1Database;

    // Apply migration
    const migrationPath = path.resolve(__dirname, '../../migrations/0001_create_player_tables.sql');
    if (fs.existsSync(migrationPath)) {
      const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
      const statements = migrationSql
        .split(/;\s*\n/)
        .map(s => s.replace(/--.*$/gm, '').trim())
        .filter(s => s.length > 0);
      const prepared = statements.map(s => db.prepare(s));
      await db.batch(prepared);
    }

    // Set up Hono app with the handler
    app = new Hono<{ Bindings: { DB: D1Database } }>();

    const deps = {
      createPlayerRepository: (_db: D1Database) => new D1PlayerRepository(_db),
    } as unknown as HandlerDeps;

    app.get('/api/players/season/:year', handlers.getSeasonPlayers(deps));

    // Wrap app.request to inject env bindings
    const originalRequest = app.request.bind(app);
    app.request = (input: RequestInfo | URL, requestInit?: RequestInit, envOrCtx?: unknown, executionCtx?: unknown) => {
      return originalRequest(input, requestInit, { DB: db } as unknown, executionCtx);
    };
  });

  it('returns aggregated player data for a valid year', async () => {
    const repo = new D1PlayerRepository(db);

    // Save two players with performances
    const player1 = createTestPlayer({
      id: 'player-one',
      name: 'Player One',
      teamCode: 'BRO',
      position: 'Fullback',
      performances: [
        createMinimalPerformance({ matchId: '2026-R1-BRO-MEL', round: 1, tries: 2, points: 8, tackleBreaks: 3, lineBreaks: 1 }),
        createMinimalPerformance({ matchId: '2026-R2-BRO-SYD', round: 2, tries: 1, points: 4, tackleBreaks: 1, lineBreaks: 0 }),
      ],
    });
    const player2 = createTestPlayer({
      id: 'player-two',
      name: 'Player Two',
      teamCode: 'MEL',
      position: 'Halfback',
      performances: [
        createMinimalPerformance({ matchId: '2026-R1-BRO-MEL', round: 1, teamCode: 'MEL', tries: 0, points: 0, tackleBreaks: 0, lineBreaks: 0 }),
      ],
    });

    await repo.save(player1);
    await repo.save(player2);

    const res = await app.request('/api/players/season/2026');
    expect(res.status).toBe(200);

    const body = await res.json() as { season: number; players: Array<Record<string, unknown>> };
    expect(body.season).toBe(2026);
    expect(body.players).toHaveLength(2);

    // Verify response shape
    const p1 = body.players.find(p => p.playerId === 'player-one');
    expect(p1).toBeDefined();
    expect(p1!.playerName).toBe('Player One');
    expect(p1!.teamCode).toBe('BRO');
    expect(p1!.position).toBe('Fullback');
    expect(p1!.gamesPlayed).toBe(2);
    expect(p1!.totalTries).toBe(3);
    expect(p1!.totalPoints).toBe(12);
    expect(p1!.totalTackleBreaks).toBe(4);
    expect(p1!.totalLineBreaks).toBe(1);
    expect(typeof p1!.averageFantasyPoints).toBe('number');
    expect(typeof p1!.totalRunMetres).toBe('number');
    expect(typeof p1!.totalTacklesMade).toBe('number');
  });

  it('returns 400 for invalid year parameter', async () => {
    const res = await app.request('/api/players/season/abc');
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Bad Request');
    expect(body.message).toContain('Invalid year');
  });

  it('returns 400 for year out of range', async () => {
    const res = await app.request('/api/players/season/1900');
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Bad Request');
  });

  it('returns 404 when no players exist for the season', async () => {
    const res = await app.request('/api/players/season/2025');
    expect(res.status).toBe(404);

    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Not Found');
    expect(body.message).toContain('No player data');
  });

  it('shows most recent team for mid-season transfers', async () => {
    const repo = new D1PlayerRepository(db);

    // Player who changed teams mid-season
    const player = createTestPlayer({
      id: 'transfer-player',
      name: 'Transfer Player',
      teamCode: 'MEL', // current team
      position: 'Lock',
      performances: [
        createMinimalPerformance({ matchId: '2026-R1-BRO-MEL', round: 1, teamCode: 'BRO' }),
        createMinimalPerformance({ matchId: '2026-R10-MEL-SYD', round: 10, teamCode: 'MEL' }),
      ],
    });
    await repo.save(player);

    const res = await app.request('/api/players/season/2026');
    expect(res.status).toBe(200);

    const body = await res.json() as { season: number; players: Array<Record<string, unknown>> };
    const p = body.players.find(p => p.playerId === 'transfer-player');
    expect(p).toBeDefined();
    // Most recent team (round 10) should be MEL
    expect(p!.teamCode).toBe('MEL');
    expect(p!.gamesPlayed).toBe(2);
  });
});
