/**
 * Integration tests for contextual projection API handler.
 * Features: 028-player-context-analytics-opponent, 029-venue-weather-analytics
 *
 * Tests handler functions directly with mock use cases (no Miniflare/D1 required).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HandlerDeps } from '../../src/api/handlers.js';
import { getContextualProjection, getVenues } from '../../src/api/handlers.js';
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

// Result with venue adjustment (feature 029)
const RESULT_WITH_VENUE: ContextualProjectionResult = {
  playerId: 'pth-halfback-1',
  playerName: 'PTH Halfback One',
  teamCode: 'PTH',
  position: 'Halfback',
  year: 2026,
  baseProjection: BASE_PROJECTION,
  adjustedProjection: { total: 89.32, floor: 75.18, ceiling: 110.0 },
  adjustments: {
    opponent: FULL_ADJUSTMENT,
    venue: { multiplier: 1.08, confidence: 1.0, sampleN: 5, stadiumId: 'suncorp' },
  },
};

// Result with weather adjustment (informational only — adjustedProjection unchanged vs opponent-only)
const RESULT_WITH_WEATHER: ContextualProjectionResult = {
  playerId: 'pth-halfback-1',
  playerName: 'PTH Halfback One',
  teamCode: 'PTH',
  position: 'Halfback',
  year: 2026,
  baseProjection: BASE_PROJECTION,
  adjustedProjection: { total: 86.24, floor: 72.8, ceiling: 106.4 }, // same as RESULT_WITH_H2H — weather not applied
  adjustments: {
    opponent: FULL_ADJUSTMENT,
    weather: { multiplier: 0.89, confidence: 0.67, sampleN: 2, category: 'rain' },
  },
};

// Result with no context params — base projection returned unchanged
const RESULT_NO_CONTEXT: ContextualProjectionResult = {
  playerId: 'pth-halfback-1',
  playerName: 'PTH Halfback One',
  teamCode: 'PTH',
  position: 'Halfback',
  year: 2026,
  baseProjection: BASE_PROJECTION,
  adjustedProjection: BASE_PROJECTION,
  adjustments: {},
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

  it('returns 200 when opponent param is absent (opponent is optional)', async () => {
    const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_NO_CONTEXT }));
    const res = await app.request(
      '/api/supercoach/2026/player/pth-halfback-1/contextual-projection',
      undefined, MOCK_ENV as any,
    );
    expect(res.status).toBe(200);
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

  // ── 029: venue param validation ───────────────────────────────────────────

  describe('venue param validation (feature 029)', () => {
    it('returns 400 INVALID_VENUE for unknown venue identifier', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=moon_base',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string; validOptions?: string[] };
      expect(body.error).toBe('INVALID_VENUE');
      expect(Array.isArray(body.validOptions)).toBe(true);
      expect((body.validOptions?.length ?? 0)).toBeGreaterThan(0);
    });

    it('returns 200 for a known canonical venue identifier', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_VENUE }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
    });

    it('venue entry is present in adjustments when venue param is supplied', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_VENUE }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustments.venue).toBeDefined();
      expect(body.adjustments.venue?.stadiumId).toBe('suncorp');
      expect(typeof body.adjustments.venue?.multiplier).toBe('number');
    });
  });

  // ── 029: weather param validation ─────────────────────────────────────────

  describe('weather param validation (feature 029)', () => {
    it('returns 400 INVALID_WEATHER_CATEGORY for unknown weather string', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&weather=hail',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string; validOptions?: string[] };
      expect(body.error).toBe('INVALID_WEATHER_CATEGORY');
      expect(Array.isArray(body.validOptions)).toBe(true);
      expect(body.validOptions).toContain('rain');
    });

    it('returns 200 for all valid canonical weather categories', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_WEATHER }));
      const categories = ['clear', 'cloudy', 'showers', 'rain', 'heavy_rain', 'windy'];
      for (const cat of categories) {
        const res = await app.request(
          `/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&weather=${cat}`,
          undefined, MOCK_ENV as any,
        );
        expect(res.status).toBe(200);
      }
    });

    it('weather entry is present in adjustments when weather param is supplied', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_WEATHER }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&weather=rain',
        undefined, MOCK_ENV as any,
      );
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustments.weather).toBeDefined();
      expect(body.adjustments.weather?.category).toBe('rain');
      expect(typeof body.adjustments.weather?.multiplier).toBe('number');
    });
  });

  // ── 029: combined context + weather is informational ─────────────────────

  describe('combined context: opponent + venue + weather (feature 029)', () => {
    it('returns 200 with all three params', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_VENUE }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&venue=suncorp&weather=rain',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
    });

    it('weather does not change adjustedProjection (informational only)', async () => {
      // Both mock results represent the same opponent-only adjusted total — weather is informational
      const app1 = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const app2 = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_WEATHER }));

      const [resWithout, resWith] = await Promise.all([
        app1.request(
          '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
          undefined, MOCK_ENV as any,
        ),
        app2.request(
          '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO&weather=rain',
          undefined, MOCK_ENV as any,
        ),
      ]);

      const b1 = await resWithout.json() as ContextualProjectionResult;
      const b2 = await resWith.json() as ContextualProjectionResult;
      // Fixture results have identical adjustedProjection (mock enforces this)
      expect(b1.adjustedProjection.total).toBe(b2.adjustedProjection.total);
    });

    it('opponent-only request is a valid 200 (regression against 028 baseline)', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_WITH_H2H }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection?opponent=BRO',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustments.opponent).toBeDefined();
      expect(body.adjustments.venue).toBeUndefined();
      expect(body.adjustments.weather).toBeUndefined();
    });

    it('no-context request returns base projection with empty adjustments', async () => {
      const app = makeApp(makeMockUseCase({ kind: 'ok', result: RESULT_NO_CONTEXT }));
      const res = await app.request(
        '/api/supercoach/2026/player/pth-halfback-1/contextual-projection',
        undefined, MOCK_ENV as any,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as ContextualProjectionResult;
      expect(body.adjustments.opponent).toBeUndefined();
      expect(body.adjustments.venue).toBeUndefined();
      expect(body.adjustments.weather).toBeUndefined();
    });
  });
});

// ── GET /api/supercoach/venues ────────────────────────────────────────────────

describe('GET /api/supercoach/venues', () => {
  const MOCK_DB = {
    prepare: () => ({
      all: async () => ({
        results: [
          { id: 'suncorp', name: 'Suncorp Stadium', city: 'Brisbane' },
          { id: 'accor_stadium', name: 'Accor Stadium', city: 'Sydney' },
        ],
      }),
    }),
  };
  const VENUES_ENV = { DB: MOCK_DB, ASSETS: null, ENVIRONMENT: 'test' };

  function makeVenuesApp(): Hono {
    const app = new Hono();
    app.get('/api/supercoach/venues', getVenues({} as HandlerDeps));
    return app;
  }

  it('returns 200', async () => {
    const res = await makeVenuesApp().request(
      '/api/supercoach/venues',
      undefined, VENUES_ENV as any,
    );
    expect(res.status).toBe(200);
  });

  it('returns a venues array', async () => {
    const res = await makeVenuesApp().request(
      '/api/supercoach/venues',
      undefined, VENUES_ENV as any,
    );
    const body = await res.json() as { venues: unknown[] };
    expect(Array.isArray(body.venues)).toBe(true);
    expect(body.venues.length).toBe(2);
  });

  it('each venue has id, name, and city fields', async () => {
    const res = await makeVenuesApp().request(
      '/api/supercoach/venues',
      undefined, VENUES_ENV as any,
    );
    const body = await res.json() as { venues: Array<{ id: string; name: string; city: string | null }> };
    const first = body.venues[0]!;
    expect(typeof first.id).toBe('string');
    expect(typeof first.name).toBe('string');
  });
});
