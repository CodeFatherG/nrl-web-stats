/**
 * Integration tests for analytics API handlers.
 * Tests the handler functions directly with mock dependencies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HandlerDeps } from '../../src/api/handlers.js';
import * as handlers from '../../src/api/handlers.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../src/application/ports/fixture-repository.js';
import { AnalyticsCache } from '../../src/analytics/analytics-cache.js';
import { GetTeamFormUseCase } from '../../src/application/use-cases/get-team-form.js';
import { broMatchesSeason2026 } from '../fixtures/analytics/matches.js';
import { broFixtures2026, allFixtures2026 } from '../fixtures/analytics/fixtures.js';
import type { Match } from '../../src/domain/match.js';
import type { Fixture } from '../../src/models/fixture.js';

// Minimal mock implementations
function createMockMatchRepository(matches: Match[]): MatchRepository {
  return {
    save: () => {},
    findByYearAndRound: (year, round) => matches.filter(m => m.year === year && m.round === round),
    findByTeam: (code, year) => matches.filter(m =>
      (m.homeTeamCode === code || m.awayTeamCode === code) && (!year || m.year === year)
    ),
    findById: (id) => matches.find(m => m.id === id) ?? null,
    findByYear: (year) => matches.filter(m => m.year === year),
    loadForYear: () => {},
    getLoadedYears: () => [...new Set(matches.map(m => m.year))],
    isYearLoaded: (year) => matches.some(m => m.year === year),
    getMatchCount: () => matches.length,
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

  beforeEach(() => {
    const matchRepo = createMockMatchRepository(broMatchesSeason2026);
    const fixtureRepo = createMockFixtureRepository(allFixtures2026);
    const cache = new AnalyticsCache();
    const getTeamFormUseCase = new GetTeamFormUseCase(matchRepo, fixtureRepo, cache);

    deps = {
      scrapeDrawUseCase: {} as HandlerDeps['scrapeDrawUseCase'],
      scrapeMatchResultsUseCase: {} as HandlerDeps['scrapeMatchResultsUseCase'],
      matchRepository: matchRepo,
      createPlayerRepository: () => ({} as any),
      createScrapePlayerStatsUseCase: () => ({} as any),
      getTeamFormUseCase,
    };

    app = new Hono();
    app.get('/api/analytics/form/:year/:teamCode', handlers.getTeamForm(deps));
  });

  describe('GET /api/analytics/form/:year/:teamCode', () => {
    it('returns form trajectory with valid params', async () => {
      const res = await app.request('/api/analytics/form/2026/BRO');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.teamCode).toBe('BRO');
      expect(body.year).toBe(2026);
      expect(body.windowSize).toBe(5);
      expect(body.snapshots).toBeDefined();
      expect(Array.isArray(body.snapshots)).toBe(true);
      expect(body.snapshots.length).toBeGreaterThan(0);
      expect(body.rollingFormRating).toBeTypeOf('number');
      expect(body.classification).toBeDefined();
    });

    it('accepts custom window query param', async () => {
      const res = await app.request('/api/analytics/form/2026/BRO?window=3');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.windowSize).toBe(3);
    });

    it('returns 400 for invalid team code', async () => {
      const res = await app.request('/api/analytics/form/2026/XXX');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with null ratings for empty results', async () => {
      // Use a year with no data
      const res = await app.request('/api/analytics/form/1999/BRO');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snapshots).toHaveLength(0);
      expect(body.rollingFormRating).toBeNull();
      expect(body.classification).toBeNull();
      expect(body.sampleSizeWarning).toBe(true);
    });

    it('response shape matches contract', async () => {
      const res = await app.request('/api/analytics/form/2026/BRO');
      const body = await res.json();

      // Top-level fields
      expect(body).toHaveProperty('teamCode');
      expect(body).toHaveProperty('teamName');
      expect(body).toHaveProperty('year');
      expect(body).toHaveProperty('windowSize');
      expect(body).toHaveProperty('rollingFormRating');
      expect(body).toHaveProperty('classification');
      expect(body).toHaveProperty('sampleSizeWarning');
      expect(body).toHaveProperty('snapshots');

      // Snapshot fields
      const snapshot = body.snapshots[0];
      expect(snapshot).toHaveProperty('round');
      expect(snapshot).toHaveProperty('result');
      expect(snapshot).toHaveProperty('margin');
      expect(snapshot).toHaveProperty('opponentCode');
      expect(snapshot).toHaveProperty('opponentStrengthRating');
      expect(snapshot).toHaveProperty('formScore');
    });
  });
});
