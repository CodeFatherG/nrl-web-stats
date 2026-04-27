/**
 * Integration tests for contextual projection API handler.
 * Feature: 028-player-context-analytics-opponent
 *
 * Tests handler functions directly with mock use cases (no Miniflare/D1 required).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HandlerDeps } from '../../src/api/handlers.js';
import { getContextualProjection } from '../../src/api/handlers.js';
import type { ContextualProjectionResult } from '../../src/analytics/contextual-projection-types.js';
import type { GetContextualProjectionUseCase, ContextualProjectionOutcome } from '../../src/application/use-cases/get-contextual-projection.js';

const MOCK_ENV = { DB: null, ASSETS: null, ENVIRONMENT: 'test' };

// ── Fixture results ───────────────────────────────────────────────────────────

const BASE_PROJECTION = { total: 77, floor: 65, ceiling: 95 };

const FULL_ADJUSTMENT = {
  multiplier: 1.12,
  confidence: 0.8,
  sampleN: 3,
  defenseFactor: 1.2,
  defenseConfidence: 1.0,
  h2hRpi: 1.1039,
  h2hConfidence: 1.0,
};

const RESULT_WITH_H2H: ContextualProjectionResult = {
  playerId: 'pth-halfback-1',
  playerName: 'PTH Halfback One',
  teamCode: 'PTH',
  position: 'Halfback',
  year: 2026,
  baseProjection: BASE_PROJECTION,
  adjustedProjection: { total: 86.24, floor: 72.8, ceiling: 106.4 },
  adjustments: { opponent: FULL_ADJUSTMENT },
};

const RESULT_NO_H2H: ContextualProjectionResult = {
  playerId: 'nqc-halfback-1',
  playerName: 'NQC Halfback One',
  teamCode: 'NQC',
  position: 'Halfback',
  year: 2026,
  baseProjection: BASE_PROJECTION,
  adjustedProjection: { total: 92.4, floor: 78, ceiling: 114 },
  adjustments: {
    opponent: {
      multiplier: 1.2,         // only from defenseFactor
      confidence: 0,           // h2hConfidence × defenseConfidence = 0 × 1.0 = 0
      sampleN: 0,
      defenseFactor: 1.2,
      defenseConfidence: 1.0,
      h2hRpi: 1.0,
      h2hConfidence: 0,
    },
  },
};

// 1 h2h game → h2hConfidence = 1/3, multiplier is attenuated between 1.0 and raw
const RESULT_ATTENUATED_H2H: ContextualProjectionResult = {
  playerId: 'pth-halfback-3',
  playerName: 'PTH Halfback Three',
  teamCode: 'PTH',
  position: 'Halfback',
  year: 2026,
  baseProjection: BASE_PROJECTION,
  adjustedProjection: { total: 78.95, floor: 66.5, ceiling: 97.1 },
  adjustments: {
    opponent: {
      multiplier: 1.025,       // lerp(1.0, 1.15, 1/3) × lerp(1.0, 1.2, 1.0) ≈ 1.025 × 1.2
      confidence: 1 / 3,
      sampleN: 1,
      defenseFactor: 1.2,
      defenseConfidence: 1.0,
      h2hRpi: 1.15,
      h2hConfidence: 1 / 3,
    },
  },
};

// Second halfback — same defenseFactor/defenseConfidence as RESULT_WITH_H2H, different total (BRO = Brisbane Broncos)
const RESULT_HALFBACK_2: ContextualProjectionResult = {
  playerId: 'pth-halfback-2',
  playerName: 'PTH Halfback Two',
  teamCode: 'PTH',
  position: 'Halfback',
  year: 2026,
  baseProjection: { total: 65, floor: 55, ceiling: 82 },
  adjustedProjection: { total: 73.5, floor: 62.2, ceiling: 92.7 },
  adjustments: {
    opponent: {
      ...FULL_ADJUSTMENT,
      h2hRpi: 1.08,   // different h2h from halfback-1
      multiplier: 1.13,
      sampleN: 3,
    },
  },
};

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeMockUseCase(outcome: ContextualProjectionOutcome): GetContextualProjectionUseCase {
  return { execute: async () => outcome } as unknown as GetContextualProjectionUseCase;
}

function makeDeps(useCase: GetContextualProjectionUseCase): HandlerDeps {
  return {
    scrapeDrawUseCase: {} as any,
    scrapeMatchResultsUseCase: {} as any,
    matchRepository: {} as any,
    createPlayerRepository: () => ({} as any),
    createScrapePlayerStatsUseCase: () => ({} as any),
    getTeamFormUseCase: {} as any,
    getMatchOutlookUseCase: {} as any,
    getPlayerTrendsUseCase: {} as any,
    getCompositionImpactUseCase: {} as any,
    createScrapeSupplementaryStatsUseCase: () => ({} as any),
    createGetSupercoachScoresUseCase: () => ({} as any),
    createScrapeTeamListsUseCase: () => ({} as any),
    createTeamListRepository: () => ({} as any),
    createScrapeCasualtyWardUseCase: () => ({} as any),
    createCasualtyWardRepository: () => ({} as any),
    createGetPlayerProjectionUseCase: () => ({} as any),
    createGetTeamProjectionRankingsUseCase: () => ({} as any),
    createSupplementaryStatsRepository: () => ({} as any),
    createGetContextualProjectionUseCase: () => useCase,
  } as HandlerDeps;
}

function makeApp(useCase: GetContextualProjectionUseCase): Hono {
  const app = new Hono();
  app.get(
    '/api/supercoach/:year/player/:playerId/contextual-projection',
    getContextualProjection(makeDeps(useCase)),
  );
  return app;
}

// ── US1: Happy path ───────────────────────────────────────────────────────────

describe('GET /api/supercoach/:year/player/:playerId/contextual-projection', () => {
  describe('US1: player with h2h history against opponent', () => {
    let app: Hono;

    beforeEach(() => {
      app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
    });

    it('returns 200', async () => {
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
    });

    it('adjustedProjection.total differs from baseProjection.total', async () => {
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustedProjection.total).not.toBe(body.baseProjection.total);
    });

    it('adjustments.opponent has all required fields', async () => {
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      const adj = body.adjustments.opponent;
      expect(typeof adj.multiplier).toBe('number');
      expect(typeof adj.confidence).toBe('number');
      expect(typeof adj.sampleN).toBe('number');
      expect(typeof adj.defenseFactor).toBe('number');
      expect(typeof adj.defenseConfidence).toBe('number');
      expect(typeof adj.h2hRpi).toBe('number');
      expect(typeof adj.h2hConfidence).toBe('number');
    });

    it('returns correct identity fields', async () => {
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      expect(body.playerId).toBe('pth-halfback-1');
      expect(body.playerName).toBe('PTH Halfback One');
      expect(body.teamCode).toBe('PTH');
      expect(body.position).toBe('Halfback');
      expect(body.year).toBe(2026);
    });
  });

  describe('US1: player with zero h2h history', () => {
    it('returns 200 with h2hRpi = 1.0 and h2hConfidence = 0', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_NO_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/nqc-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustments.opponent.h2hRpi).toBe(1.0);
      expect(body.adjustments.opponent.h2hConfidence).toBe(0);
      expect(body.adjustments.opponent.sampleN).toBe(0);
    });

    it('adjustedProjection differs from base (defenseFactor still applies)', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_NO_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/nqc-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustedProjection.total).not.toBe(body.baseProjection.total);
    });
  });

  describe('US1: player with exactly 1 h2h game (attenuated)', () => {
    it('h2h multiplier is attenuated (not 1.0, not raw RPI)', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_ATTENUATED_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-3/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      const adj = body.adjustments.opponent;
      expect(adj.sampleN).toBe(1);
      expect(adj.h2hConfidence).toBeCloseTo(1 / 3, 3);
      // Effective h2h should be between 1.0 and rawRpi
      const effectiveH2h = 1 + (adj.h2hRpi - 1) * adj.h2hConfidence;
      expect(adj.multiplier).not.toBe(1.0);
      expect(adj.multiplier).not.toBe(adj.h2hRpi * adj.defenseFactor);
      expect(effectiveH2h).toBeGreaterThan(1.0);
      expect(effectiveH2h).toBeLessThan(adj.h2hRpi);
    });
  });

  // ── Validation: missing/invalid params ─────────────────────────────────────

  it('returns 400 MISSING_OPPONENT when opponent param is absent', async () => {
    const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
    const res = await app.request(
      '/api/supercoach/2026/player/pth-halfback-1/contextual-projection',
      undefined, MOCK_ENV as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('MISSING_OPPONENT');
  });

  it('returns 400 INVALID_TEAM_CODE for unknown opponent code', async () => {
    const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
    const res = await app.request(
      '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=ZZZ',
      undefined, MOCK_ENV as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; validOptions?: string[] };
    expect(body.error).toBe('INVALID_TEAM_CODE');
    expect(Array.isArray(body.validOptions)).toBe(true);
    expect((body.validOptions?.length ?? 0)).toBeGreaterThan(0);
  });

  it('returns 400 INVALID_YEAR for out-of-range year', async () => {
    const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
    const res = await app.request(
      '/api/supercoach/1800/player/pth-halfback-1/contextual-projection?opponent=BRO',
      undefined, MOCK_ENV as any,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_YEAR');
  });

  it('returns 404 PLAYER_NOT_FOUND when use case returns player_not_found', async () => {
    const app = makeApp(makeMockUseCase({ kind: 'player_not_found' }));
    const res = await app.request(
      '/api/supercoach/2026/player/unknown-player/contextual-projection?opponent=BRO',
      undefined, MOCK_ENV as any,
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('PLAYER_NOT_FOUND');
  });

  it('returns 404 PLAYER_PROJECTION_NOT_FOUND when use case returns no_projection', async () => {
    const app = makeApp(makeMockUseCase({ kind: 'no_projection' }));
    const res = await app.request(
      '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
      undefined, MOCK_ENV as any,
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('PLAYER_PROJECTION_NOT_FOUND');
  });

  // ── US2: Shared defense factor across players ─────────────────────────────

  describe('US2: shared defenseFactor for same opponent+position', () => {
    it('two halfbacks vs BRI share identical defenseFactor and defenseConfidence', async () => {
      const app1 = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const app2 = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_HALFBACK_2 }));

      const [res1, res2] = await Promise.all([
        app1.request(
          '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
          undefined, MOCK_ENV as any,
        ),
        app2.request(
          '/api/supercoach/2026/player/pth-halfback-2/contextual-projection?opponent=BRO',
          undefined, MOCK_ENV as any,
        ),
      ]);

      const body1 = await res1.json() as ContextualProjectionResult;
      const body2 = await res2.json() as ContextualProjectionResult;

      expect(body1.adjustments.opponent.defenseFactor)
        .toBe(body2.adjustments.opponent.defenseFactor);
      expect(body1.adjustments.opponent.defenseConfidence)
        .toBe(body2.adjustments.opponent.defenseConfidence);

      // Different players → different adjusted totals
      expect(body1.adjustedProjection.total).not.toBe(body2.adjustedProjection.total);
    });
  });

  // ── US3: venue/weather params accepted, not applied ───────────────────────

  describe('US3: venue and weather params are accepted without error', () => {
    it('returns 200 when venue and weather params are present', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp&weather=rain',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
    });

    it('response has no venue key in adjustments', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp&weather=rain',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as { adjustments: Record<string, unknown> };
      expect('venue' in body.adjustments).toBe(false);
    });

    it('response has no weather key in adjustments', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp&weather=rain',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as { adjustments: Record<string, unknown> };
      expect('weather' in body.adjustments).toBe(false);
    });

    it('adjustedProjection.total is identical with and without venue/weather params', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));

      const [resWithParams, resWithout] = await Promise.all([
        app.request(
          '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp&weather=rain',
          undefined, MOCK_ENV as any,
        ),
        app.request(
          '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
          undefined, MOCK_ENV as any,
        ),
      ]);

      const b1 = await resWithParams.json() as ContextualProjectionResult;
      const b2 = await resWithout.json() as ContextualProjectionResult;
      expect(b1.adjustedProjection.total).toBe(b2.adjustedProjection.total);
    });
  });
});
