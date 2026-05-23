/**
 * Integration tests for analytics API handlers.
 *
 * Spec 037: handlers now wrap responses in an AvailabilityEnvelope. The four
 * endpoints serve from precomputed-artifact repositories; this test uses an
 * `InMemoryTeamFormRepository` populated via the precompute use case so the
 * GET handler returns `{ available: true, asOfRound, data }`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HandlerDeps } from '../../src/api/handlers.js';
import * as handlers from '../../src/api/handlers.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../src/application/ports/fixture-repository.js';
import { GetTeamFormUseCase } from '../../src/application/use-cases/get-team-form.js';
import { PrecomputeTeamFormUseCase } from '../../src/application/use-cases/precompute-team-form.js';
import { InMemoryTeamFormRepository } from '../../src/infrastructure/persistence/in-memory-team-form-repository.js';
import { broMatchesSeason2026 } from '../fixtures/analytics/matches.js';
import { allFixtures2026 } from '../fixtures/analytics/fixtures.js';
import type { Match } from '../../src/domain/match.js';
import type { Fixture } from '../../src/models/fixture.js';

function createMockMatchRepository(matches: Match[]): MatchRepository {
  return {
    save: async () => {},
    saveAll: async () => {},
    findByYearAndRound: async (year, round) => matches.filter(m => m.year === year && m.round === round),
    findByTeam: async (code, year) => matches.filter(m =>
      (m.homeTeamCode === code || m.awayTeamCode === code) && (!year || m.year === year)
    ),
    findById: async (id) => matches.find(m => m.id === id) ?? null,
    findByYear: async (year) => matches.filter(m => m.year === year),
    getLoadedYears: async () => [...new Set(matches.map(m => m.year))],
    isYearLoaded: async (year) => matches.some(m => m.year === year),
    getMatchCount: async () => matches.length,
  };
}

function createMockFixtureRepository(fixtures: Fixture[]): FixtureRepository {
  return {
    findByYear: (year) => fixtures.filter(f => f.year === year),
    findByTeam: (code) => fixtures.filter(f => f.teamCode === code),
    findByRound: (year, round) => fixtures.filter(f => f.year === year && f.round === round),
    findByYearAndTeam: (year, code) => fixtures.filter(f => f.year === year && f.teamCode === code),
    isYearLoaded: () => true,
    getLoadedYears: () => [2026],
    getAllTeams: () => [],
    getTeamByCode: () => undefined,
    getLastScrapeTimes: () => ({}),
    getTotalFixtureCount: () => fixtures.length,
    loadFixtures: () => {},
  };
}

describe('Analytics Handlers Integration', () => {
  let app: Hono;
  let deps: HandlerDeps;
  let teamFormRepo: InMemoryTeamFormRepository;

  beforeEach(async () => {
    const matchRepo = createMockMatchRepository(broMatchesSeason2026);
    const fixtureRepo = createMockFixtureRepository(allFixtures2026);
    teamFormRepo = new InMemoryTeamFormRepository();
    const getTeamFormUseCase = new GetTeamFormUseCase(matchRepo, fixtureRepo, teamFormRepo);
    const precompute = new PrecomputeTeamFormUseCase(matchRepo, fixtureRepo, teamFormRepo);

    // Seed default-windowSize aggregate so the read path returns available: true.
    await precompute.execute({ year: 2026, asOfRound: 5, teamCode: 'BRO' });
    await precompute.execute({ year: 1999, asOfRound: 0, teamCode: 'BRO' });

    deps = {
      scrapeDrawUseCase: {} as HandlerDeps['scrapeDrawUseCase'],
      scrapeMatchResultsUseCase: {} as HandlerDeps['scrapeMatchResultsUseCase'],
      matchRepository: matchRepo,
      createPlayerRepository: () => ({} as any),
      createScrapePlayerStatsUseCase: () => ({} as any),
      getTeamFormUseCase,
      getMatchOutlookUseCase: {} as HandlerDeps['getMatchOutlookUseCase'],
      getPlayerTrendsUseCase: {} as HandlerDeps['getPlayerTrendsUseCase'],
      getCompositionImpactUseCase: {} as HandlerDeps['getCompositionImpactUseCase'],
      teamFormRepository: teamFormRepo,
      matchOutlookRepository: {} as HandlerDeps['matchOutlookRepository'],
      playerTrendsRepository: {} as HandlerDeps['playerTrendsRepository'],
      compositionImpactRepository: {} as HandlerDeps['compositionImpactRepository'],
      watermarkFn: async () => 5,
    } as HandlerDeps;

    app = new Hono();
    app.get('/api/analytics/form/:year/:teamCode', handlers.getTeamForm(deps));
  });

  describe('GET /api/analytics/form/:year/:teamCode', () => {
    it('returns AvailabilityEnvelope with default window (available)', async () => {
      const res = await app.request('/api/analytics/form/2026/BRO');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(true);
      expect(body.asOfRound).toBe(5);
      expect(body.data.teamCode).toBe('BRO');
      expect(body.data.year).toBe(2026);
      expect(body.data.windowSize).toBe(5);
      expect(Array.isArray(body.data.snapshots)).toBe(true);
    });

    it('returns precompute-pending envelope when no aggregate exists', async () => {
      // Wipe the seeded data
      teamFormRepo = new InMemoryTeamFormRepository();
      const matchRepo = createMockMatchRepository(broMatchesSeason2026);
      const fixtureRepo = createMockFixtureRepository(allFixtures2026);
      const getTeamFormUseCase = new GetTeamFormUseCase(matchRepo, fixtureRepo, teamFormRepo);
      const freshDeps: HandlerDeps = {
        ...deps,
        matchRepository: matchRepo,
        getTeamFormUseCase,
        teamFormRepository: teamFormRepo,
      };
      const freshApp = new Hono();
      freshApp.get('/api/analytics/form/:year/:teamCode', handlers.getTeamForm(freshDeps));
      const res = await freshApp.request('/api/analytics/form/2026/BRO');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(false);
      expect(body.asOfRound).toBeNull();
      expect(body.reason).toBe('precompute-pending');
    });

    it('non-default window runs live compute and returns available', async () => {
      // Pass a fake env binding so the handler can reach c.env.DB in the
      // live-compute branch (FR-016).
      const res = await app.request('/api/analytics/form/2026/BRO?window=3', undefined, { DB: {} as D1Database });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(true);
      expect(body.asOfRound).toBe(5);
      expect(body.data.windowSize).toBe(3);
    });

    it('returns 400 for invalid team code', async () => {
      const res = await app.request('/api/analytics/form/2026/XXX');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });
  });
});
