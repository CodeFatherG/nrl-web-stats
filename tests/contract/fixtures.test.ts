/**
 * Contract tests for GET /api/fixtures endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('GET /api/fixtures', () => {
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

  it('returns empty array when no data loaded', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/fixtures');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('validates invalid team code', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/fixtures?team=XYZ');

    expect(response.status).toBe(400);
    const data = await response.json() as { error: string; message: string; validOptions: string[] };
    expect(data.error).toBe('INVALID_TEAM');
    expect(data.validOptions).toContain('MEL');
    expect(data.validOptions).toContain('BRO');
  });

  it('returns CORS headers', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/fixtures');

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
