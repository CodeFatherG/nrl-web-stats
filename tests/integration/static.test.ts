/**
 * Integration tests for static file serving
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Static File Serving', () => {
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

  it('returns 404 for root path without ASSETS binding', async () => {
    // Without ASSETS binding, worker should return fallback message
    const response = await mf.dispatchFetch('http://localhost/');

    // Worker returns 404 with helpful message when no ASSETS binding
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain('Static file serving requires ASSETS binding');
  });

  it('does not serve API routes as static files', async () => {
    // API routes should still work
    const response = await mf.dispatchFetch('http://localhost/api/health');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });

  it('handles SPA routes by falling back without ASSETS', async () => {
    // Client-side routes like /schedule should fall through to SPA handler
    const response = await mf.dispatchFetch('http://localhost/schedule');

    // Without ASSETS binding, returns fallback
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain('Static file serving requires ASSETS binding');
  });
});
