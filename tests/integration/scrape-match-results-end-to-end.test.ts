/**
 * End-to-end behavioural test for the durable match-results scrape watermark
 * (feature 040 T014). Exercises the skip / scrape / mark transitions across
 * the full freshness predicate (null → in-progress → stale → terminal).
 *
 * Per quickstart.md §4.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrapeMatchResultsUseCase } from '../../src/application/use-cases/scrape-match-results.js';
import { InMemoryMatchResultsScrapeWatermarkRepository } from '../../src/infrastructure/persistence/in-memory-match-results-scrape-watermark-repository.js';
import { InMemoryMatchRepository } from '../../src/database/in-memory-match-repository.js';
import type { MatchResultSource, MatchResult } from '../../src/domain/ports/match-result-source.js';
import { MatchStatus } from '../../src/domain/match.js';
import { success } from '../../src/domain/result.js';

const NOW = new Date('2026-05-26T12:00:00Z');
const IN_PROGRESS_TTL_MS = 30 * 60 * 1000;

function makeResults(opts: { allCompleted: boolean }): MatchResult[] {
  const status = opts.allCompleted ? MatchStatus.Completed : MatchStatus.Scheduled;
  const score = opts.allCompleted ? 14 : (null as unknown as number);
  return [
    {
      matchId: '2026-R5-BRO-SYD',
      homeTeamCode: 'SYD',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 5,
      homeScore: opts.allCompleted ? 14 : score,
      awayScore: opts.allCompleted ? 22 : score,
      status,
      scheduledTime: '2026-05-25T09:00:00Z',
      weather: null,
    },
  ];
}

describe('ScrapeMatchResultsUseCase — end-to-end watermark transitions', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let source: MatchResultSource;
  let matchRepo: InMemoryMatchRepository;
  let watermarkRepo: InMemoryMatchResultsScrapeWatermarkRepository;
  let useCase: ScrapeMatchResultsUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fetchFn = vi.fn();
    source = { fetchResults: fetchFn };
    matchRepo = new InMemoryMatchRepository();
    watermarkRepo = new InMemoryMatchResultsScrapeWatermarkRepository();
    useCase = new ScrapeMatchResultsUseCase(source, matchRepo, watermarkRepo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('null → in-progress → terminal: full skip/scrape/mark cycle', async () => {
    // (1) First invocation: null watermark → fetch, mark with allCompleted=false.
    fetchFn.mockResolvedValueOnce(success(makeResults({ allCompleted: false })));
    await useCase.execute(2026, 5);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const w1 = await watermarkRepo.findByRound(2026, 5);
    expect(w1).not.toBeNull();
    expect(w1?.allCompleted).toBe(false);

    // (2) Second invocation within 30 minutes: skip; fetch count must stay at 1.
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60 * 1000));
    await useCase.execute(2026, 5);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // (3) Advance past TTL; third invocation re-scrapes; this time
    // allCompleted=true so the watermark becomes terminal.
    vi.setSystemTime(new Date(NOW.getTime() + IN_PROGRESS_TTL_MS + 1000));
    fetchFn.mockResolvedValueOnce(success(makeResults({ allCompleted: true })));
    await useCase.execute(2026, 5);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const w2 = await watermarkRepo.findByRound(2026, 5);
    expect(w2?.allCompleted).toBe(true);

    // (4) Far-future invocation: terminal watermark → no fetch.
    vi.setSystemTime(new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000));
    await useCase.execute(2026, 5);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
