/**
 * Contract tests for GET /api/rounds/:year/:round endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('GET /api/rounds/:year/:round', () => {
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

  it('returns 400 for invalid year', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/rounds/1990/1');

    expect(response.status).toBe(400);
    const data = await response.json() as { error: string };
    expect(data.error).toBe('INVALID_YEAR');
  });

  it('returns 400 for invalid round', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/rounds/2026/30');

    expect(response.status).toBe(400);
    const data = await response.json() as { error: string };
    expect(data.error).toBe('INVALID_ROUND');
  });

  it('returns round structure for valid params (no data)', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/rounds/2026/1');

    expect(response.status).toBe(200);
    const data = await response.json() as { year: number; round: number; matches: unknown[]; byeTeams: string[] };

    expect(data.year).toBe(2026);
    expect(data.round).toBe(1);
    expect(Array.isArray(data.matches)).toBe(true);
    expect(Array.isArray(data.byeTeams)).toBe(true);
  });
});
