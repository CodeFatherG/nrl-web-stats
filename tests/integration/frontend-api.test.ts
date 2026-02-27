/**
 * Integration tests for frontend API compatibility
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Frontend API Integration', () => {
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

  it('GET /api/teams returns team list', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/teams');

    expect(response.status).toBe(200);

    const data = await response.json() as { teams: Array<{ code: string; name: string }> };

    expect(data).toHaveProperty('teams');
    expect(Array.isArray(data.teams)).toBe(true);
    // Should have 17 NRL teams
    expect(data.teams.length).toBe(17);

    // Check structure
    const team = data.teams[0];
    expect(team).toHaveProperty('code');
    expect(team).toHaveProperty('name');
    expect(typeof team.code).toBe('string');
    expect(team.code.length).toBe(3);
  });

  it('GET /api/years returns years data', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/years');

    expect(response.status).toBe(200);

    const data = await response.json() as { years: number[]; lastUpdated: Record<string, string> };

    expect(data).toHaveProperty('years');
    expect(Array.isArray(data.years)).toBe(true);
    expect(data).toHaveProperty('lastUpdated');
    expect(typeof data.lastUpdated).toBe('object');
  });

  it('API endpoints support CORS preflight', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/fixtures', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('GET /api/fixtures returns fixtures array', async () => {
    const response = await mf.dispatchFetch('http://localhost/api/fixtures');

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
