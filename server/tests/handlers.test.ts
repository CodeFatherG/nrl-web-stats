/**
 * Tests for API handlers
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Request, Response } from 'express';
import {
  healthCheck,
  getYears,
  getTeams,
  getFixtures,
  getTeamSchedule,
  getRoundDetails,
  getSeasonSummary,
} from '../src/api/handlers.js';
import { loadFixtures, resetDatabase } from '../src/database/store.js';
import { createFixture } from '../src/models/fixture.js';
import type { Fixture } from '../src/models/fixture.js';

// Mock request/response helpers
function mockRequest(params = {}, query = {}, body = {}): Partial<Request> {
  return {
    params,
    query,
    body,
  };
}

function mockResponse(): Partial<Response> & { json: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn> } {
  const res: Partial<Response> & { json: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn> } = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res;
}

function mockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

// Create test fixtures
function createTestFixtures(): Fixture[] {
  return [
    createFixture(2026, 1, 'MEL', 'BRO', true, 500),
    createFixture(2026, 1, 'BRO', 'MEL', false, 500),
    createFixture(2026, 2, 'MEL', 'SYD', false, 450),
    createFixture(2026, 2, 'SYD', 'MEL', true, 450),
    createFixture(2026, 3, 'MEL', null, false, -500), // bye
    createFixture(2026, 1, 'PAR', 'SYD', false, 440),
    createFixture(2026, 1, 'SYD', 'PAR', true, 440),
  ];
}

describe('API Handlers', () => {
  beforeEach(() => {
    resetDatabase();
    loadFixtures(2026, createTestFixtures());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await healthCheck(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          loadedYears: expect.any(Array),
          totalFixtures: expect.any(Number),
        })
      );
    });
  });

  describe('getYears', () => {
    it('should return loaded years', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await getYears(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          years: expect.arrayContaining([2026]),
        })
      );
    });
  });

  describe('getTeams', () => {
    it('should return all teams', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await getTeams(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          teams: expect.any(Array),
        })
      );
    });
  });

  describe('getFixtures', () => {
    it('should return fixtures with no filters', async () => {
      const req = mockRequest({}, {});
      const res = mockResponse();
      const next = mockNext();

      await getFixtures(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtures: expect.any(Array),
          count: expect.any(Number),
          filters: expect.any(Object),
        })
      );
    });

    it('should filter by team', async () => {
      const req = mockRequest({}, { team: 'MEL' });
      const res = mockResponse();
      const next = mockNext();

      await getFixtures(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalled();
      const call = res.json.mock.calls[0][0];
      expect(call.fixtures.every((f: Fixture) => f.teamCode === 'MEL')).toBe(true);
    });

    it('should filter by year', async () => {
      const req = mockRequest({}, { year: '2026' });
      const res = mockResponse();
      const next = mockNext();

      await getFixtures(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalled();
      const call = res.json.mock.calls[0][0];
      expect(call.fixtures.every((f: Fixture) => f.year === 2026)).toBe(true);
    });

    it('should call next with error for invalid team code', async () => {
      const req = mockRequest({}, { team: 'XXX' });
      const res = mockResponse();
      const next = mockNext();

      await getFixtures(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getTeamSchedule', () => {
    it('should return team schedule with strength totals', async () => {
      const req = mockRequest({ code: 'MEL' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getTeamSchedule(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          team: expect.objectContaining({ code: 'MEL' }),
          schedule: expect.any(Array),
          totalStrength: expect.any(Number),
          byeRounds: expect.any(Array),
        })
      );
    });

    it('should include bye rounds', async () => {
      const req = mockRequest({ code: 'MEL' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getTeamSchedule(req as Request, res as Response, next);

      const call = res.json.mock.calls[0][0];
      expect(call.byeRounds).toContain(3); // MEL has bye in round 3
    });

    it('should call next with error for invalid team', async () => {
      const req = mockRequest({ code: 'XXX' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getTeamSchedule(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getRoundDetails', () => {
    it('should return round details with matches', async () => {
      const req = mockRequest({ year: '2026', round: '1' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getRoundDetails(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          year: 2026,
          round: 1,
          matches: expect.any(Array),
          byeTeams: expect.any(Array),
        })
      );
    });

    it('should call next with error for invalid round', async () => {
      const req = mockRequest({ year: '2026', round: '99' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getRoundDetails(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should call next with error for invalid year', async () => {
      const req = mockRequest({ year: '1900', round: '1' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getRoundDetails(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getSeasonSummary', () => {
    it('should return season summary with all rounds', async () => {
      const req = mockRequest({ year: '2026' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getSeasonSummary(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          year: 2026,
          rounds: expect.any(Array),
        })
      );

      const call = res.json.mock.calls[0][0];
      expect(call.rounds).toHaveLength(27); // All 27 rounds
    });

    it('should include matches grouped by round', async () => {
      const req = mockRequest({ year: '2026' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getSeasonSummary(req as Request, res as Response, next);

      const call = res.json.mock.calls[0][0];
      const round1 = call.rounds.find((r: { round: number }) => r.round === 1);
      expect(round1).toBeDefined();
      expect(round1.matches.length).toBeGreaterThan(0);
    });

    it('should include bye teams in rounds', async () => {
      const req = mockRequest({ year: '2026' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getSeasonSummary(req as Request, res as Response, next);

      const call = res.json.mock.calls[0][0];
      const round3 = call.rounds.find((r: { round: number }) => r.round === 3);
      expect(round3.byeTeams).toContain('MEL'); // MEL has bye in round 3
    });

    it('should call next with error for year not loaded', async () => {
      const req = mockRequest({ year: '2020' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getSeasonSummary(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should call next with error for invalid year format', async () => {
      const req = mockRequest({ year: 'invalid' }, {});
      const res = mockResponse();
      const next = mockNext();

      await getSeasonSummary(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
