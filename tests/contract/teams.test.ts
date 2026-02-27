/**
 * Contract tests for team endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Teams API', () => {
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

  describe('GET /api/teams', () => {
    it('returns all 17 NRL teams', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/teams');

      expect(response.status).toBe(200);
      const data = await response.json() as Array<{ code: string; name: string }>;

      expect(data).toHaveLength(17);

      // Verify known teams exist
      const codes = data.map(t => t.code);
      expect(codes).toContain('MEL');
      expect(codes).toContain('BRO');
      expect(codes).toContain('SYD');
      expect(codes).toContain('PTH');
    });

    it('returns teams with correct structure', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/teams');
      const data = await response.json() as Array<{ code: string; name: string }>;

      for (const team of data) {
        expect(team).toHaveProperty('code');
        expect(team).toHaveProperty('name');
        expect(team.code).toHaveLength(3);
        expect(team.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /api/teams/:code/schedule', () => {
    it('returns 400 for invalid team code', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/teams/XYZ/schedule');

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('INVALID_TEAM');
    });

    it('returns team schedule structure for valid team', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/teams/MEL/schedule');

      expect(response.status).toBe(200);
      const data = await response.json() as { team: { code: string; name: string }; fixtures: unknown[] };

      expect(data).toHaveProperty('team');
      expect(data.team.code).toBe('MEL');
      expect(data.team.name).toBe('Melbourne Storm');
      expect(data).toHaveProperty('fixtures');
      expect(Array.isArray(data.fixtures)).toBe(true);
    });

    it('is case insensitive for team code', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/teams/mel/schedule');

      expect(response.status).toBe(200);
      const data = await response.json() as { team: { code: string } };
      expect(data.team.code).toBe('MEL');
    });
  });
});
