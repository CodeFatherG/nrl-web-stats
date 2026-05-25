/**
 * Contract tests for rankings endpoints.
 *
 * Spec 039 changed the no-data response from `404 NOT_FOUND` to the
 * standard availability envelope (`200 { available: false, asOfRound: null,
 * reason: 'precompute-pending' }`).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Rankings API', () => {
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

  describe('GET /api/rankings/:year', () => {
    it('returns 400 for invalid year', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/invalid');
      expect(response.status).toBe(400);
    });

    it('returns the availability envelope when no precompute artifact exists', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026');
      expect(response.status).toBe(200);
      const data = await response.json() as { available: false; asOfRound: null; reason: string };
      expect(data.available).toBe(false);
      expect(data.asOfRound).toBeNull();
    });
  });

  describe('GET /api/rankings/:year/:code', () => {
    it('returns 400 for invalid team code', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/XYZ');
      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('INVALID_TEAM');
    });

    it('returns the availability envelope for a valid team with no precompute artifact', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/MEL');
      expect(response.status).toBe(200);
      const data = await response.json() as { available: false };
      expect(data.available).toBe(false);
    });
  });

  describe('GET /api/rankings/:year/:code/:round', () => {
    it('returns 400 for invalid round', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/MEL/99');
      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('INVALID_ROUND');
    });

    it('returns the availability envelope for a valid request with no precompute artifact', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/MEL/1');
      expect(response.status).toBe(200);
      const data = await response.json() as { available: false };
      expect(data.available).toBe(false);
    });
  });
});
