/**
 * Contract tests for GET /api/season/:year/summary endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('GET /api/season/:year/summary', () => {
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

  it('returns 400 for invalid year format', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/season/abc/summary');

    expect(response.status).toBe(400);
    const data = await response.json() as { error: string };
    expect(data.error).toBe('INVALID_YEAR');
  });

  it('returns 404 when year data not loaded', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/season/2026/summary');

    expect(response.status).toBe(404);
    const data = await response.json() as { error: string; message: string };
    expect(data.error).toBe('NOT_FOUND');
    expect(data.message).toContain('not been loaded');
  });
});
