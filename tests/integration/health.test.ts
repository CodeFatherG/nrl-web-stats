/**
 * Integration tests for health check endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Health Check API', () => {
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

  it('returns health status with ok', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/health');

    expect(response.status).toBe(200);

    const data = await response.json() as { status: string; loadedYears: number[]; totalFixtures: number };

    expect(data.status).toBe('ok');
    expect(data.loadedYears).toBeDefined();
    expect(Array.isArray(data.loadedYears)).toBe(true);
    expect(typeof data.totalFixtures).toBe('number');
  });

  it('returns correct content type', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/health');

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('includes CORS headers', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/health');

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
