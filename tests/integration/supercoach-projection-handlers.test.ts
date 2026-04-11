/**
 * Integration tests for Supercoach player projection API handlers.
 * Feature: 025-supercoach-player-projections
 *
 * Tests handler functions directly with mock use cases (no Miniflare/D1 required).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HandlerDeps } from '../../src/api/handlers.js';
import { getPlayerProjection, getTeamProjectionRankings } from '../../src/api/handlers.js';
import type { PlayerProjectionProfile, RankedPlayer, TeamProjectionRankings } from '../../src/analytics/player-projection-types.js';
import type { GetPlayerProjectionUseCase } from '../../src/application/use-cases/get-player-projection.js';
import type { GetTeamProjectionRankingsUseCase } from '../../src/application/use-cases/get-team-projection-rankings.js';

/** Stub env that satisfies c.env.DB without a real D1 binding */
const MOCK_ENV = { DB: null, ASSETS: null, ENVIRONMENT: 'test' };

// ── Fixture data ──────────────────────────────────────────────────────────────

const SPIKE_DIST = {
  negative: { count: 0, frequency: 0 },
  nil:      { count: 0, frequency: 0 },
  low:      { count: 0, frequency: 0 },
  moderate: { count: 3, frequency: 0.4286 },
  high:     { count: 4, frequency: 0.5714 },
  boom:     { count: 0, frequency: 0 },
};

const KENNEDY_GAMES_SUMMARY = [
  { round: 1, totalScore: 88, floorScore: 51, spikeScore: 37, minutesPlayed: 80 },
  { round: 2, totalScore: 72, floorScore: 42, spikeScore: 30, minutesPlayed: 80 },
  { round: 3, totalScore: 104, floorScore: 58, spikeScore: 46, minutesPlayed: 80 },
  { round: 4, totalScore: 68, floorScore: 40, spikeScore: 28, minutesPlayed: 72 },
  { round: 5, totalScore: 80, floorScore: 46, spikeScore: 34, minutesPlayed: 64 },
  { round: 6, totalScore: 92, floorScore: 58, spikeScore: 34, minutesPlayed: 80 },
  { round: 7, totalScore: 76, floorScore: 55, spikeScore: 21, minutesPlayed: 78 },
];

const KENNEDY_PROFILE: PlayerProjectionProfile = {
  playerId: '504279',
  playerName: 'William Kennedy',
  teamCode: 'SHA',
  position: 'Forward',
  avgMinutes: 76.29,
  floorMean: 50,
  floorStd: 7.46,
  floorCv: 0.1492,
  floorPerMinute: 0.655,
  spikeMean: 32.86,
  spikeStd: 7.80,
  spikeCv: 0.2373,
  spikePerMinute: 0.431,
  spikeP25: 29,
  spikeP50: 34,
  spikeP75: 35.5,
  spikeP90: 40.6,
  spikeDistribution: SPIKE_DIST,
  projectedTotal: 82.86,
  projectedFloor: 79,
  projectedCeiling: 90.6,
  gamesPlayed: 7,
  lowSampleWarning: false,
  noUsableData: false,
  games: KENNEDY_GAMES_SUMMARY,
};

const HIGH_CV_PROFILE: PlayerProjectionProfile = {
  ...KENNEDY_PROFILE,
  playerId: '111',
  playerName: 'High CV Player',
  floorCv: null,   // < 2 games — compositeScore will be null
  floorStd: null,
  gamesPlayed: 1,
  lowSampleWarning: true,
};

function makeRankedPlayer(rank: number, score: number, profile: PlayerProjectionProfile): RankedPlayer {
  return { rank, compositeScore: score, profile };
}

function makeMockPlayerProjectionUseCase(
  returnValue: PlayerProjectionProfile | null
): GetPlayerProjectionUseCase {
  return { execute: async () => returnValue } as unknown as GetPlayerProjectionUseCase;
}

function makeMockTeamProjectionRankingsUseCase(
  returnValue: TeamProjectionRankings
): GetTeamProjectionRankingsUseCase {
  return { execute: async () => returnValue } as unknown as GetTeamProjectionRankingsUseCase;
}

// Minimal deps stub — only projection factories are wired, others are stubs
function makeDeps(
  playerProjectionUseCase: GetPlayerProjectionUseCase | null = null,
  teamRankingsUseCase: GetTeamProjectionRankingsUseCase | null = null,
): HandlerDeps {
  return {
    scrapeDrawUseCase: {} as HandlerDeps['scrapeDrawUseCase'],
    scrapeMatchResultsUseCase: {} as HandlerDeps['scrapeMatchResultsUseCase'],
    matchRepository: {} as HandlerDeps['matchRepository'],
    createPlayerRepository: () => ({} as any),
    createScrapePlayerStatsUseCase: () => ({} as any),
    getTeamFormUseCase: {} as HandlerDeps['getTeamFormUseCase'],
    getMatchOutlookUseCase: {} as HandlerDeps['getMatchOutlookUseCase'],
    getPlayerTrendsUseCase: {} as HandlerDeps['getPlayerTrendsUseCase'],
    getCompositionImpactUseCase: {} as HandlerDeps['getCompositionImpactUseCase'],
    createScrapeSupplementaryStatsUseCase: () => ({} as any),
    createGetSupercoachScoresUseCase: () => ({} as any),
    createScrapeTeamListsUseCase: () => ({} as any),
    createTeamListRepository: () => ({} as any),
    createScrapeCasualtyWardUseCase: () => ({} as any),
    createCasualtyWardRepository: () => ({} as any),
    createGetPlayerProjectionUseCase: () => playerProjectionUseCase ?? ({} as any),
    createGetTeamProjectionRankingsUseCase: () => teamRankingsUseCase ?? ({} as any),
  };
}

// ── Player projection endpoint ────────────────────────────────────────────────

describe('GET /api/supercoach/:year/player/:playerId/projection', () => {
  let app: Hono;

  describe('happy path', () => {
    beforeEach(() => {
      const deps = makeDeps(makeMockPlayerProjectionUseCase(KENNEDY_PROFILE));
      app = new Hono();
      app.get('/api/supercoach/:year/player/:playerId/projection', getPlayerProjection(deps));
    });

    it('returns 200 with player projection profile', async () => {
      const res = await app.request('/api/supercoach/2026/player/504279/projection', undefined, MOCK_ENV as any);
      expect(res.status).toBe(200);
      const body = await res.json() as PlayerProjectionProfile;
      expect(body.playerId).toBe('504279');
      expect(body.playerName).toBe('William Kennedy');
      expect(body.teamCode).toBe('SHA');
      expect(body.gamesPlayed).toBe(7);
      expect(body.lowSampleWarning).toBe(false);
      expect(body.noUsableData).toBe(false);
    });

    it('includes floor and spike components', async () => {
      const res = await app.request('/api/supercoach/2026/player/504279/projection', undefined, MOCK_ENV as any);
      const body = await res.json() as PlayerProjectionProfile;
      expect(body.floorMean).toBe(50);
      expect(body.spikeMean).toBeCloseTo(32.86, 1);
      expect(body.projectedTotal).toBeCloseTo(82.86, 1);
    });

    it('serialises finite spikeCv as a number', async () => {
      const res = await app.request('/api/supercoach/2026/player/504279/projection', undefined, MOCK_ENV as any);
      const body = await res.json() as Record<string, unknown>;
      expect(typeof body['spikeCv']).toBe('number');
      expect(body['spikeCv']).not.toBeNull();
    });
  });

  it('serialises Infinity spikeCv as null', async () => {
    const infiniteProfile: PlayerProjectionProfile = {
      ...KENNEDY_PROFILE,
      spikeCv: Infinity,
    };
    const deps = makeDeps(makeMockPlayerProjectionUseCase(infiniteProfile));
    const app = new Hono();
    app.get('/api/supercoach/:year/player/:playerId/projection', getPlayerProjection(deps));

    const res = await app.request('/api/supercoach/2026/player/504279/projection', undefined, MOCK_ENV as any);
    const body = await res.json() as Record<string, unknown>;
    expect(body['spikeCv']).toBeNull();
  });

  it('returns 404 when player not found', async () => {
    const deps = makeDeps(makeMockPlayerProjectionUseCase(null));
    const app = new Hono();
    app.get('/api/supercoach/:year/player/:playerId/projection', getPlayerProjection(deps));

    const res = await app.request('/api/supercoach/2026/player/999999/projection', undefined, MOCK_ENV as any);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('PLAYER_NOT_FOUND');
  });

  it('returns 400 for invalid year', async () => {
    const deps = makeDeps(makeMockPlayerProjectionUseCase(KENNEDY_PROFILE));
    const app = new Hono();
    app.get('/api/supercoach/:year/player/:playerId/projection', getPlayerProjection(deps));

    const res = await app.request('/api/supercoach/1800/player/504279/projection', undefined, MOCK_ENV as any);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_YEAR');
  });
});

// ── Team rankings endpoint ────────────────────────────────────────────────────

function makeRankings(mode = 'composite'): TeamProjectionRankings {
  return {
    teamCode: 'SHA',
    year: 2026,
    mode: mode as any,
    rankedPlayers: [
      makeRankedPlayer(1, 99.3, KENNEDY_PROFILE),
      makeRankedPlayer(2, 85.0, { ...KENNEDY_PROFILE, playerId: '111', playerName: 'Player Two' }),
    ],
    excludedCount: 1,
  };
}

describe('GET /api/supercoach/:year/team/:teamCode/rankings', () => {
  let app: Hono;

  beforeEach(() => {
    const deps = makeDeps(null, makeMockTeamProjectionRankingsUseCase(makeRankings()));
    app = new Hono();
    app.get('/api/supercoach/:year/team/:teamCode/rankings', getTeamProjectionRankings(deps));
  });

  it('returns 200 with ranked player list (default composite mode)', async () => {
    const res = await app.request('/api/supercoach/2026/team/SHA/rankings', undefined, MOCK_ENV as any);
    expect(res.status).toBe(200);
    const body = await res.json() as TeamProjectionRankings;
    expect(body.teamCode).toBe('SHA');
    expect(body.year).toBe(2026);
    expect(body.rankedPlayers).toHaveLength(2);
    expect(body.excludedCount).toBe(1);
  });

  it('returns rank=1 for the top-ranked player', async () => {
    const res = await app.request('/api/supercoach/2026/team/SHA/rankings', undefined, MOCK_ENV as any);
    const body = await res.json() as TeamProjectionRankings;
    expect(body.rankedPlayers[0]!.rank).toBe(1);
    expect(body.rankedPlayers[0]!.profile.playerName).toBe('William Kennedy');
  });

  it('passes mode=captaincy to the use case', async () => {
    const captaincyRankings = makeRankings('captaincy');
    const mockUseCase: GetTeamProjectionRankingsUseCase = {
      execute: async (_year, _teamCode, mode) => ({ ...captaincyRankings, mode: mode! }),
    } as unknown as GetTeamProjectionRankingsUseCase;
    const deps = makeDeps(null, mockUseCase);
    const testApp = new Hono();
    testApp.get('/api/supercoach/:year/team/:teamCode/rankings', getTeamProjectionRankings(deps));

    const res = await testApp.request('/api/supercoach/2026/team/SHA/rankings?mode=captaincy', undefined, MOCK_ENV as any);
    const body = await res.json() as TeamProjectionRankings;
    expect(body.mode).toBe('captaincy');
  });

  it.each(['composite', 'captaincy', 'selection', 'trade'])('accepts mode=%s', async (mode) => {
    const mockUseCase: GetTeamProjectionRankingsUseCase = {
      execute: async (_year, _teamCode, m) => makeRankings(m),
    } as unknown as GetTeamProjectionRankingsUseCase;
    const deps = makeDeps(null, mockUseCase);
    const testApp = new Hono();
    testApp.get('/api/supercoach/:year/team/:teamCode/rankings', getTeamProjectionRankings(deps));

    const res = await testApp.request(`/api/supercoach/2026/team/SHA/rankings?mode=${mode}`, undefined, MOCK_ENV as any);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid mode', async () => {
    const res = await app.request('/api/supercoach/2026/team/SHA/rankings?mode=bogus', undefined, MOCK_ENV as any);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_MODE');
  });

  it('returns 400 for invalid team code', async () => {
    const res = await app.request('/api/supercoach/2026/team/XYZ/rankings', undefined, MOCK_ENV as any);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_TEAM_CODE');
  });

  it('returns 400 for invalid year', async () => {
    const res = await app.request('/api/supercoach/1800/team/SHA/rankings', undefined, MOCK_ENV as any);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_YEAR');
  });

  it('serialises Infinity spikeCv as null in ranked players', async () => {
    const infiniteProfile: PlayerProjectionProfile = { ...KENNEDY_PROFILE, spikeCv: Infinity };
    const mockUseCase: GetTeamProjectionRankingsUseCase = {
      execute: async () => ({
        teamCode: 'SHA', year: 2026, mode: 'composite',
        rankedPlayers: [makeRankedPlayer(1, 99.3, infiniteProfile)],
        excludedCount: 0,
      }),
    } as unknown as GetTeamProjectionRankingsUseCase;
    const deps = makeDeps(null, mockUseCase);
    const testApp = new Hono();
    testApp.get('/api/supercoach/:year/team/:teamCode/rankings', getTeamProjectionRankings(deps));

    const res = await testApp.request('/api/supercoach/2026/team/SHA/rankings', undefined, MOCK_ENV as any);
    const body = await res.json() as TeamProjectionRankings;
    const profile = body.rankedPlayers[0]!.profile as unknown as Record<string, unknown>;
    expect(profile['spikeCv']).toBeNull();
  });
});
