/**
 * Contract tests for rankings endpoints
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

    it('returns 404 when no data loaded', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026');

      expect(response.status).toBe(404);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/rankings/:year/:code', () => {
    it('returns 400 for invalid team code', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/XYZ');

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('INVALID_TEAM');
    });

    it('returns 404 when no data loaded for valid team', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/MEL');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/rankings/:year/:code/:round', () => {
    it('returns 400 for invalid round', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/MEL/99');

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toBe('INVALID_ROUND');
    });

    it('returns 404 when no data loaded', async () => {
      const response = await mf.dispatchFetch('http://localhost/api/rankings/2026/MEL/1');

      expect(response.status).toBe(404);
    });
  });
});
