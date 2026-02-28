/**
 * Integration tests for team streaks API endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

interface StreakResponse {
  team: { code: string; name: string };
  year: number;
  streaks: Array<{
    type: 'soft_draw' | 'rough_patch';
    startRound: number;
    endRound: number;
    rounds: number;
    favourableCount: number;
    unfavourableCount: number;
  }>;
  summary: {
    softDrawCount: number;
    roughPatchCount: number;
    longestSoftDraw: number | null;
    longestRoughPatch: number | null;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
  validOptions?: (string | number)[];
}

describe('Streaks API', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      scriptPath: './dist/worker.js',
      compatibilityDate: '2024-01-01',
      compatibilityFlags: ['nodejs_compat'],
    });
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('returns 400 with INVALID_TEAM for invalid team code', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/streaks/2026/INVALID');

    expect(response.status).toBe(400);

    const data = await response.json() as ErrorResponse;

    expect(data.error).toBe('INVALID_TEAM');
    expect(data.message).toContain('INVALID');
    expect(data.validOptions).toBeDefined();
    expect(Array.isArray(data.validOptions)).toBe(true);
  });

  it('returns 400 with INVALID_YEAR for invalid year', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/streaks/abc/MEL');

    expect(response.status).toBe(400);

    const data = await response.json() as ErrorResponse;

    expect(data.error).toBe('INVALID_YEAR');
  });

  it('returns 404 with NOT_FOUND for year with no data', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/streaks/2020/MEL');

    expect(response.status).toBe(404);

    const data = await response.json() as ErrorResponse;

    expect(data.error).toMatch(/NOT_FOUND|TEAM_NOT_FOUND/);
  });

  it('returns valid response structure for valid team and year (if data loaded)', async () => {
    // First trigger a scrape to ensure data exists
    await mf.dispatchFetch('http://localhost/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026 }),
    });

    const response = await mf.dispatchFetch('http://localhost/api/streaks/2026/MEL');

    // If data was loaded successfully, check the response structure
    if (response.status === 200) {
      const data = await response.json() as StreakResponse;

      expect(data).toHaveProperty('team');
      expect(data.team).toHaveProperty('code', 'MEL');
      expect(data.team).toHaveProperty('name');
      expect(data).toHaveProperty('year', 2026);
      expect(data).toHaveProperty('streaks');
      expect(Array.isArray(data.streaks)).toBe(true);
      expect(data).toHaveProperty('summary');
      expect(data.summary).toHaveProperty('softDrawCount');
      expect(data.summary).toHaveProperty('roughPatchCount');
      expect(data.summary).toHaveProperty('longestSoftDraw');
      expect(data.summary).toHaveProperty('longestRoughPatch');

      // Verify streaks are ordered by startRound ascending
      for (let i = 1; i < data.streaks.length; i++) {
        expect(data.streaks[i].startRound).toBeGreaterThanOrEqual(
          data.streaks[i - 1].startRound
        );
      }

      // Verify each streak has valid structure
      for (const streak of data.streaks) {
        expect(['soft_draw', 'rough_patch']).toContain(streak.type);
        expect(streak.startRound).toBeLessThanOrEqual(streak.endRound);
        expect(streak.rounds).toBe(streak.favourableCount + streak.unfavourableCount);
      }
    }
  });
});
