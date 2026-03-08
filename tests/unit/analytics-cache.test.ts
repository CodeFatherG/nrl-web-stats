import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsCache } from '../../src/analytics/analytics-cache.js';

describe('AnalyticsCache', () => {
  let cache: AnalyticsCache;

  beforeEach(() => {
    cache = new AnalyticsCache();
  });

  it('returns null on cache miss', () => {
    expect(cache.get('nonexistent', 'v1')).toBeNull();
  });

  it('returns cached value on cache hit with matching version', () => {
    cache.set('form-BRO-2026', { rating: 0.72 }, 'v1');
    const result = cache.get<{ rating: number }>('form-BRO-2026', 'v1');
    expect(result).toEqual({ rating: 0.72 });
  });

  it('invalidates on version mismatch', () => {
    cache.set('form-BRO-2026', { rating: 0.72 }, 'v1');
    const result = cache.get('form-BRO-2026', 'v2');
    expect(result).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('invalidates after TTL expires', () => {
    cache.set('form-BRO-2026', { rating: 0.72 }, 'v1');

    // Advance time past 10 minutes
    vi.useFakeTimers();
    vi.advanceTimersByTime(11 * 60 * 1000);

    const result = cache.get('form-BRO-2026', 'v1');
    expect(result).toBeNull();

    vi.useRealTimers();
  });

  it('returns value within TTL window', () => {
    vi.useFakeTimers();
    cache.set('form-BRO-2026', { rating: 0.72 }, 'v1');

    // Advance 9 minutes (within TTL)
    vi.advanceTimersByTime(9 * 60 * 1000);

    const result = cache.get<{ rating: number }>('form-BRO-2026', 'v1');
    expect(result).toEqual({ rating: 0.72 });

    vi.useRealTimers();
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1', 'v1');
    cache.set('key2', 'value2', 'v1');
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('overwrites existing entry with new value and version', () => {
    cache.set('form-BRO-2026', { rating: 0.72 }, 'v1');
    cache.set('form-BRO-2026', { rating: 0.65 }, 'v2');

    const result = cache.get<{ rating: number }>('form-BRO-2026', 'v2');
    expect(result).toEqual({ rating: 0.65 });
  });
});
