/**
 * Integration tests for getGameStrengthRatings handler.
 * Tests the handler with a mocked GetGameStrengthUseCase.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HandlerDeps } from '../../src/api/handlers.js';
import * as handlers from '../../src/api/handlers.js';
import type { RoundGSR, MatchGSR, TeamMatchGSR } from '../../src/domain/game-strength.js';

// Fake Cloudflare env so c.env.DB is defined (not undefined) in plain Hono test context
const FAKE_ENV = { DB: {} as D1Database, ASSETS: undefined as any, ENVIRONMENT: 'test' };

function makeTeamGSR(code: string, opp: string): TeamMatchGSR {
  return {
    teamCode: code,
    opponentCode: opp,
    weightedAvgScored: 1900,
    weightedAvgAllowed: 1750,
    overallGSR: 1825,
    normalizedOverallGSR: 1.05,
    categoricalGSR: 1810,
    normalizedCategoricalGSR: 1.04,
    categoryStrengths: [
      { category: 'base', label: 'Base (Tackles & Hitups)', weightedAvgScored: 760, weightedAvgAllowed: 700, combinedStrength: 730, leagueWeight: 0.42 },
      { category: 'scoring', label: 'Scoring', weightedAvgScored: 380, weightedAvgAllowed: 350, combinedStrength: 365, leagueWeight: 0.21 },
      { category: 'create', label: 'Create', weightedAvgScored: 285, weightedAvgAllowed: 263, combinedStrength: 274, leagueWeight: 0.15 },
      { category: 'evade', label: 'Evade', weightedAvgScored: 190, weightedAvgAllowed: 175, combinedStrength: 183, leagueWeight: 0.10 },
      { category: 'defence', label: 'Defence', weightedAvgScored: 190, weightedAvgAllowed: 175, combinedStrength: 183, leagueWeight: 0.10 },
      { category: 'negative', label: 'Negative', weightedAvgScored: -95, weightedAvgAllowed: -88, combinedStrength: -91, leagueWeight: 0.02 },
    ],
    teamSamplesUsed: 5,
    opponentSamplesUsed: 5,
    sampleSizeWarning: false,
  };
}

function makeRoundGSR(year = 2026, round = 5): RoundGSR {
  const match: MatchGSR = {
    matchId: `${year}-R${round}-BRO-NZL`,
    year,
    round,
    homeTeam: makeTeamGSR('BRO', 'NZL'),
    awayTeam: makeTeamGSR('NZL', 'BRO'),
  };
  return {
    year,
    round,
    leagueAvgTeamScore: 1738,
    matches: [match],
    methodology: {
      halfLifeRounds: 6,
      offenseWeight: 0.5,
      minRoundsForReliability: 3,
      seasonTransitionPenalty: 12,
      categoryWeightingMethod: 'dynamic',
    },
  };
}

function makeMinimalDeps(executeImpl: (...args: any[]) => Promise<RoundGSR>): HandlerDeps {
  return {
    createGetGameStrengthUseCase: () => ({ execute: executeImpl } as any),
    createLockGameStrengthUseCase: () => ({} as any),
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
    createGetContextualProjectionUseCase: () => ({} as any),
    createGetContextualProfileUseCase: () => ({} as any),
    playerMovementsCache: {} as any,
    createComputePlayerMovementsUseCase: () => ({} as any),
  };
}

describe('getGameStrengthRatings handler', () => {
  let app: Hono;

  function setupApp(executeImpl: (...args: any[]) => Promise<RoundGSR>) {
    const deps = makeMinimalDeps(executeImpl);
    app = new Hono();
    app.get('/api/supercoach/:year/game-strength/:round', handlers.getGameStrengthRatings(deps));
  }

  describe('200 OK — successful response', () => {
    beforeEach(() => {
      setupApp(() => Promise.resolve(makeRoundGSR()));
    });

    it('returns 200 with RoundGSR shape', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/5', undefined, FAKE_ENV);
      expect(res.status).toBe(200);
      const body = await res.json() as RoundGSR;
      expect(body.year).toBe(2026);
      expect(body.round).toBe(5);
      expect(typeof body.leagueAvgTeamScore).toBe('number');
      expect(Array.isArray(body.matches)).toBe(true);
      expect(body.methodology).toBeDefined();
    });

    it('response includes methodology block with required fields', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/5', undefined, FAKE_ENV);
      const body = await res.json() as RoundGSR;
      expect(body.methodology.halfLifeRounds).toBe(6);
      expect(body.methodology.offenseWeight).toBe(0.5);
      expect(body.methodology.minRoundsForReliability).toBe(3);
      expect(body.methodology.categoryWeightingMethod).toBe('dynamic');
      expect(body.methodology.seasonTransitionPenalty).toBe(12);
    });

    it('each fixture has homeTeam and awayTeam with normalised ratings', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/5', undefined, FAKE_ENV);
      const body = await res.json() as RoundGSR;
      const match = body.matches[0];
      expect(match.homeTeam.teamCode).toBe('BRO');
      expect(match.awayTeam.teamCode).toBe('NZL');
      expect(typeof match.homeTeam.normalizedOverallGSR).toBe('number');
      expect(typeof match.homeTeam.normalizedCategoricalGSR).toBe('number');
    });

    it('categoryStrengths has 6 entries', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/5', undefined, FAKE_ENV);
      const body = await res.json() as RoundGSR;
      expect(body.matches[0].homeTeam.categoryStrengths).toHaveLength(6);
    });
  });

  describe('halfLife parameter passing', () => {
    it('passes custom halfLife to the use case', async () => {
      let capturedHalfLife: number | undefined;
      setupApp((_year: number, _round: number, hl: number) => {
        capturedHalfLife = hl;
        return Promise.resolve(makeRoundGSR());
      });
      await app.request('/api/supercoach/2026/game-strength/5?halfLife=10', undefined, FAKE_ENV);
      expect(capturedHalfLife).toBe(10);
    });

    it('uses default halfLife (6) when not specified', async () => {
      let capturedHalfLife: number | undefined;
      setupApp((_year: number, _round: number, hl: number) => {
        capturedHalfLife = hl;
        return Promise.resolve(makeRoundGSR());
      });
      await app.request('/api/supercoach/2026/game-strength/5', undefined, FAKE_ENV);
      expect(capturedHalfLife).toBe(6);
    });
  });

  describe('400 validation errors', () => {
    beforeEach(() => setupApp(() => Promise.resolve(makeRoundGSR())));

    it('returns 400 for year before 1998', async () => {
      const res = await app.request('/api/supercoach/1997/game-strength/5', undefined, FAKE_ENV);
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('INVALID_YEAR');
    });

    it('returns 400 for non-numeric year', async () => {
      const res = await app.request('/api/supercoach/abc/game-strength/5', undefined, FAKE_ENV);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('INVALID_YEAR');
    });

    it('returns 400 for round 0', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/0', undefined, FAKE_ENV);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('INVALID_ROUND');
    });

    it('returns 400 for invalid halfLife', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/5?halfLife=0', undefined, FAKE_ENV);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('INVALID_HALF_LIFE');
    });
  });

  describe('404 — no fixtures found', () => {
    beforeEach(() => {
      setupApp(() => {
        const err = Object.assign(new Error('No fixtures found for 2026 round 99'), { code: 'NO_FIXTURES_FOUND' });
        return Promise.reject(err);
      });
    });

    it('returns 404 when use case throws NO_FIXTURES_FOUND', async () => {
      const res = await app.request('/api/supercoach/2026/game-strength/99', undefined, FAKE_ENV);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('NO_FIXTURES_FOUND');
    });
  });
});
