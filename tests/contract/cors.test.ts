/**
 * Contract tests for CORS support
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('CORS Support', () => {
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

  it('handles OPTIONS preflight request', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  it('includes CORS headers on GET responses', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/teams', {
      headers: {
        'Origin': 'http://example.com',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('includes CORS headers on POST responses', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/scrape', {
      method: 'POST',
      headers: {
        'Origin': 'http://example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ year: 2026 }),
    });

    // Response may be 400 or 500 depending on scrape outcome, but should have CORS
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
