import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NrlComCasualtyWardAdapter } from '../../src/infrastructure/adapters/nrl-com-casualty-ward-adapter.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures/nrl-com');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

function mockFetchResponse(data: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Server Error',
    json: () => Promise.resolve(data),
  }));
}

describe('NrlComCasualtyWardAdapter', () => {
  let adapter: NrlComCasualtyWardAdapter;

  beforeEach(() => {
    adapter = new NrlComCasualtyWardAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchCasualtyWard', () => {
    it('parses all players from casualty-ward.json fixture', async () => {
      const fixtureData = loadFixture('casualty-ward.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchCasualtyWard();

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(5);
    });

    it('maps fields correctly from nrl.com to domain', async () => {
      const fixtureData = loadFixture('casualty-ward.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchCasualtyWard();
      if (!result.success) throw new Error('Expected success');

      const first = result.data[0];
      expect(first.firstName).toBe('Jack');
      expect(first.lastName).toBe('Gosiewski');
      expect(first.injury).toBe('Concussion');
      expect(first.expectedReturn).toBe('Round 4');
      expect(first.teamNickname).toBe('Broncos');
      expect(first.profileUrl).toBe('https://www.nrl.com/players/nrl-premiership/broncos/jack-gosiewski/');
    });

    it('handles empty casualty ward', async () => {
      const fixtureData = loadFixture('casualty-ward-empty.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchCasualtyWard();

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toHaveLength(0);
    });

    it('returns failure on HTTP error', async () => {
      mockFetchResponse({}, 503);

      const result = await adapter.fetchCasualtyWard();

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain('HTTP 503');
    });

    it('returns failure on invalid JSON structure', async () => {
      mockFetchResponse({ invalid: 'data' });

      const result = await adapter.fetchCasualtyWard();

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain('validation failed');
    });

    it('includes all expected fields per player', async () => {
      const fixtureData = loadFixture('casualty-ward.json');
      mockFetchResponse(fixtureData);

      const result = await adapter.fetchCasualtyWard();
      if (!result.success) throw new Error('Expected success');

      for (const player of result.data) {
        expect(player).toHaveProperty('firstName');
        expect(player).toHaveProperty('lastName');
        expect(player).toHaveProperty('teamNickname');
        expect(player).toHaveProperty('injury');
        expect(player).toHaveProperty('expectedReturn');
        expect(player).toHaveProperty('profileUrl');
      }
    });
  });
});
