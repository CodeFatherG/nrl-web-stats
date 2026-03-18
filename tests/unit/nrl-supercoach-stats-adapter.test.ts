import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NrlSupercoachStatsAdapter } from '../../src/infrastructure/adapters/nrl-supercoach-stats-adapter.js';
import fixtureData from '../fixtures/supercoach-stats-round1.json';

function mockFetchResponses(responses: Array<{ data: unknown; status?: number }>): ReturnType<typeof vi.fn> {
  const mockFn = vi.fn();
  for (const { data, status = 200 } of responses) {
    mockFn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
    });
  }
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

describe('NrlSupercoachStatsAdapter', () => {
  let adapter: NrlSupercoachStatsAdapter;

  beforeEach(() => {
    adapter = new NrlSupercoachStatsAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful fetch', () => {
    it('parses all players from jqGrid response', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(5);
    });

    it('correctly maps row object to SupplementaryPlayerStats fields', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const cleary = result.data.find(p => p.playerName === 'Cleary, Nathan');
      expect(cleary).toBeDefined();
      expect(cleary!.season).toBe(2026);
      expect(cleary!.round).toBe(1);
      expect(cleary!.trySaves).toBe(0);
      expect(cleary!.lastTouch).toBe(1);
      expect(cleary!.missedGoals).toBe(0);
      expect(cleary!.missedFieldGoals).toBe(0);
      expect(cleary!.effectiveOffloads).toBe(1);
      expect(cleary!.ineffectiveOffloads).toBe(0);
      expect(cleary!.runsOver8m).toBe(5);
      expect(cleary!.runsUnder8m).toBe(3);
      expect(cleary!.heldUpInGoal).toBe(0);
      expect(cleary!.kickRegatherBreak).toBe(0);
    });

    it('maps all players correctly', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const names = result.data.map(p => p.playerName);
      expect(names).toEqual([
        'Cleary, Nathan',
        'Munster, Cameron',
        'Walsh, Reece',
        'Haas, Payne',
        'Talakai, Siosifa',
      ]);
    });

    it('extracts price as raw integer', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const cleary = result.data.find(p => p.playerName === 'Cleary, Nathan')!;
      expect(cleary.price).toBe(692200);

      const walsh = result.data.find(p => p.playerName === 'Walsh, Reece')!;
      expect(walsh.price).toBe(511700);
    });

    it('extracts break even as signed integer (positive, zero, negative)', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const cleary = result.data.find(p => p.playerName === 'Cleary, Nathan')!;
      expect(cleary.breakEven).toBe(42); // positive

      const walsh = result.data.find(p => p.playerName === 'Walsh, Reece')!;
      expect(walsh.breakEven).toBe(0); // zero

      const munster = result.data.find(p => p.playerName === 'Munster, Cameron')!;
      expect(munster.breakEven).toBe(-11); // negative

      const haas = result.data.find(p => p.playerName === 'Haas, Payne')!;
      expect(haas.breakEven).toBe(-110); // large negative
    });

    it('returns null for price and breakEven when columns are missing', async () => {
      const noPriceData = JSON.parse(JSON.stringify(fixtureData));
      delete noPriceData.rows[0].Price;
      delete noPriceData.rows[0].BE;

      mockFetchResponses([{ data: noPriceData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const cleary = result.data.find(p => p.playerName === 'Cleary, Nathan')!;
      expect(cleary.price).toBeNull();
      expect(cleary.breakEven).toBeNull();

      // Other players should still have values
      const munster = result.data.find(p => p.playerName === 'Munster, Cameron')!;
      expect(munster.price).toBe(583100);
      expect(munster.breakEven).toBe(-11);
    });

    it('extracts team code from row', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const cleary = result.data.find(p => p.playerName === 'Cleary, Nathan')!;
      expect(cleary.teamCode).toBe('PTH');

      const walsh = result.data.find(p => p.playerName === 'Walsh, Reece')!;
      expect(walsh.teamCode).toBe('BRO');

      const talakai = result.data.find(p => p.playerName === 'Talakai, Siosifa')!;
      expect(talakai.teamCode).toBe('SHA');
    });

    it('verifies Munster supplementary stats', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      const munster = result.data.find(p => p.playerName === 'Munster, Cameron')!;
      expect(munster.lastTouch).toBe(0);
      expect(munster.missedGoals).toBe(0);
      expect(munster.missedFieldGoals).toBe(0);
      expect(munster.effectiveOffloads).toBe(2);
      expect(munster.ineffectiveOffloads).toBe(1);
      expect(munster.runsOver8m).toBe(8);
      expect(munster.runsUnder8m).toBe(5);
      expect(munster.heldUpInGoal).toBe(0);
      expect(munster.kickRegatherBreak).toBe(1);
    });

    it('filters by round', async () => {
      const multiRound = JSON.parse(JSON.stringify(fixtureData));
      multiRound.rows[3].Rd = '02'; // Haas → round 2
      multiRound.rows[4].Rd = '02'; // Talakai → round 2

      mockFetchResponses([{ data: multiRound }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      expect(result.data).toHaveLength(3); // Only Cleary, Munster, Walsh
      expect(result.data.map(p => p.playerName)).toEqual([
        'Cleary, Nathan',
        'Munster, Cameron',
        'Walsh, Reece',
      ]);
    });

    it('returns empty array when no rows match the round', async () => {
      mockFetchResponses([{ data: fixtureData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 5);
      if (!result.success) throw new Error('Expected success');

      expect(result.data).toHaveLength(0);
    });
  });

  describe('request headers', () => {
    it('sends X-Requested-With: XMLHttpRequest header', async () => {
      const mockFn = mockFetchResponses([{ data: fixtureData }]);

      await adapter.fetchSupplementaryStats(2026, 1);

      expect(mockFn).toHaveBeenCalledTimes(1);
      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[1].headers['X-Requested-With']).toBe('XMLHttpRequest');
    });

    it('sends User-Agent header', async () => {
      const mockFn = mockFetchResponses([{ data: fixtureData }]);

      await adapter.fetchSupplementaryStats(2026, 1);

      const callArgs = mockFn.mock.calls[0];
      expect(callArgs[1].headers['User-Agent']).toBe('Mozilla/5.0');
    });

    it('constructs correct URL with year and page params', async () => {
      const mockFn = mockFetchResponses([{ data: fixtureData }]);

      await adapter.fetchSupplementaryStats(2026, 1);

      const calledUrl = new URL(mockFn.mock.calls[0][0]);
      expect(calledUrl.searchParams.get('year')).toBe('2026');
      expect(calledUrl.searchParams.get('grid_id')).toBe('list1');
      expect(calledUrl.searchParams.get('jqgrid_page')).toBe('1');
      expect(calledUrl.searchParams.get('rows')).toBe('500');
      expect(calledUrl.searchParams.get('sidx')).toBe('Score');
      expect(calledUrl.searchParams.get('sord')).toBe('desc');
    });
  });

  describe('pagination', () => {
    it('fetches multiple pages when total > 1', async () => {
      const page1 = { ...JSON.parse(JSON.stringify(fixtureData)), total: 2 };
      const page2 = {
        ...JSON.parse(JSON.stringify(fixtureData)),
        page: '2',
        total: 2,
        rows: [],
      };

      const mockFn = mockFetchResponses([{ data: page1 }, { data: page2 }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(result.data).toHaveLength(5); // Only page 1 has data
    });
  });

  describe('error handling', () => {
    it('returns failure when HTTP response is not ok', async () => {
      mockFetchResponses([{ data: {}, status: 503 }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('HTTP 503');
    });

    it('returns failure when response fails Zod validation', async () => {
      mockFetchResponses([{ data: { invalid: 'response' } }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('validation failed');
    });

    it('returns failure when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await adapter.fetchSupplementaryStats(2026, 1);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain('Network error');
    });

    it('skips rows without comma-separated player name', async () => {
      const badData = JSON.parse(JSON.stringify(fixtureData));
      badData.rows[0].Name2 = 'InvalidName'; // No comma

      mockFetchResponses([{ data: badData }]);

      const result = await adapter.fetchSupplementaryStats(2026, 1);
      if (!result.success) throw new Error('Expected success');

      expect(result.data).toHaveLength(4); // Skipped invalid row
    });
  });
});
