import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { encodeArtifact } from '../../../../src/infrastructure/persistence/fixture-envelope.js';
import type { Fixture } from '../../../../src/models/fixture.js';

const NOW = '2026-05-28T12:34:56.789Z';

describe('fixture envelope wire format (A3 TimedScrape)', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('encodes a representative artifact byte-for-byte', () => {
    const fixtures: readonly Fixture[] = [];
    const { value, metadata } = encodeArtifact(2026, fixtures);

    const expected =
      '{"schemaVersion":1,"computedAt":"2026-05-28T12:34:56.789Z",' +
      '"freshness":{"lastScrapedAt":"2026-05-28T12:34:56.789Z"},"payload":[]}';

    expect(value).toBe(expected);
    expect(metadata).toEqual({ lastScrapedAt: NOW });
  });
});
