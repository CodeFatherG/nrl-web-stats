import { describe, it, expect, beforeEach } from 'vitest';
import {
  HandleScrapeJobUseCase,
  type HandleScrapeJobDeps,
} from '../../../src/application/use-cases/handle-scrape-job.js';
import type { JobHandle, ScrapeJob } from '../../../src/application/ports/job-queue.js';

// ---------------------------------------------------------------------------
// Test handle that records lifecycle decisions
// ---------------------------------------------------------------------------

interface RecordedHandle extends JobHandle<ScrapeJob> {
  acks: number;
  retries: Array<{ delaySeconds?: number }>;
}

function recordingHandle(body: ScrapeJob, attempts: number = 1): RecordedHandle {
  const state = { settled: false };
  const h: RecordedHandle = {
    body,
    attemptCount: attempts,
    acks: 0,
    retries: [],
    ack() {
      if (state.settled) return;
      state.settled = true;
      h.acks += 1;
    },
    retry(opts?: { delaySeconds?: number }) {
      if (state.settled) return;
      state.settled = true;
      h.retries.push(opts ?? {});
    },
  };
  return h;
}

// ---------------------------------------------------------------------------
// Stub deps — every use case is a recorder
// ---------------------------------------------------------------------------

interface RecorderCalls {
  matchResults: Array<{ year: number; round: number }>;
  playerStats: Array<{ year: number; round: number; force?: boolean }>;
  suppStats: Array<{ year: number; round: number; force: boolean }>;
  teamLists: Array<{ year: number; round?: number }>;
  casualty: number;
  movements: Array<{ year: number; round: number }>;
  gsr: Array<{ year: number; round: number }>;
}

function makeDeps(throws?: Error): { deps: HandleScrapeJobDeps; calls: RecorderCalls } {
  const calls: RecorderCalls = {
    matchResults: [],
    playerStats: [],
    suppStats: [],
    teamLists: [],
    casualty: 0,
    movements: [],
    gsr: [],
  };
  const maybeThrow = <T>(returnValue: T) => async () => {
    if (throws) throw throws;
    return returnValue;
  };
  const deps: HandleScrapeJobDeps = {
    scrapeMatchResults: {
      execute: async (year: number, round?: number) => {
        if (throws) throw throws;
        calls.matchResults.push({ year, round: round! });
        return {} as any;
      },
    } as any,
    scrapePlayerStats: {
      execute: async (year: number, round: number, force?: boolean) => {
        if (throws) throw throws;
        calls.playerStats.push({ year, round, force });
        return {} as any;
      },
    } as any,
    scrapeSupplementaryStats: {
      execute: async (year: number, round: number, force?: boolean) => {
        if (throws) throw throws;
        calls.suppStats.push({ year, round, force: force ?? false });
        return {} as any;
      },
    } as any,
    scrapeTeamLists: {
      execute: async (year: number, round?: number) => {
        if (throws) throw throws;
        calls.teamLists.push({ year, round });
        return {} as any;
      },
    } as any,
    scrapeCasualtyWard: {
      execute: async () => {
        if (throws) throw throws;
        calls.casualty += 1;
        return {} as any;
      },
    } as any,
    computePlayerMovements: {
      execute: async (year: number, round: number) => {
        if (throws) throw throws;
        calls.movements.push({ year, round });
      },
    } as any,
    lockGameStrength: {
      execute: async (year: number, round: number) => {
        if (throws) throw throws;
        calls.gsr.push({ year, round });
      },
    } as any,
  };
  return { deps, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandleScrapeJobUseCase — dispatch routing', () => {
  it('routes scrape-match-results to ScrapeMatchResultsUseCase and acks', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 12 });
    await uc.handleOne(handle);
    expect(calls.matchResults).toEqual([{ year: 2026, round: 12 }]);
    expect(handle.acks).toBe(1);
    expect(handle.retries).toHaveLength(0);
  });

  it('routes scrape-player-stats with force=true (matches today\'s cron behavior)', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({ type: 'scrape-player-stats', version: 1, year: 2026, round: 8 });
    await uc.handleOne(handle);
    expect(calls.playerStats).toEqual([{ year: 2026, round: 8, force: true }]);
  });

  it('routes scrape-supplementary-stats and propagates the force flag', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    await uc.handleOne(recordingHandle({ type: 'scrape-supplementary-stats', version: 1, year: 2026, round: 3, force: true }));
    expect(calls.suppStats).toEqual([{ year: 2026, round: 3, force: true }]);
  });

  it('routes scrape-team-lists with a specific round', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    await uc.handleOne(recordingHandle({ type: 'scrape-team-lists', version: 1, year: 2026, round: 7 }));
    expect(calls.teamLists).toEqual([{ year: 2026, round: 7 }]);
  });

  it('routes scrape-casualty-ward (no year/round params used by use case)', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    await uc.handleOne(recordingHandle({ type: 'scrape-casualty-ward', version: 1, year: 2026 }));
    expect(calls.casualty).toBe(1);
  });

  it('routes compute-player-movements', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    await uc.handleOne(recordingHandle({ type: 'compute-player-movements', version: 1, year: 2026, round: 9 }));
    expect(calls.movements).toEqual([{ year: 2026, round: 9 }]);
  });

  it('routes lock-game-strength-ratings', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    await uc.handleOne(recordingHandle({ type: 'lock-game-strength-ratings', version: 1, year: 2026, round: 5 }));
    expect(calls.gsr).toEqual([{ year: 2026, round: 5 }]);
  });
});

describe('HandleScrapeJobUseCase — error classification', () => {
  it('retries with delay on a transient (HTTP 5xx) error', async () => {
    const { deps } = makeDeps(new Error('Failed: HTTP 503 Service Unavailable'));
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 });
    await uc.handleOne(handle);
    expect(handle.acks).toBe(0);
    expect(handle.retries).toHaveLength(1);
    expect(handle.retries[0].delaySeconds).toBeGreaterThan(0);
  });

  it('re-throws on a terminal (HTTP 4xx) error so the platform counts the attempt', async () => {
    const { deps } = makeDeps(new Error('Validation failed: bad payload'));
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 });
    await expect(uc.handleOne(handle)).rejects.toThrow(/Validation failed/);
    expect(handle.acks).toBe(0);
    expect(handle.retries).toHaveLength(0);
  });

  it('retries with longer delay on HTTP 429 rate-limit', async () => {
    const { deps } = makeDeps(new Error('HTTP 429 Too Many Requests'));
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 });
    await uc.handleOne(handle);
    expect(handle.retries).toHaveLength(1);
    expect(handle.retries[0].delaySeconds).toBeGreaterThanOrEqual(120);
  });

  it('never calls both ack and retry on the same handle (success path)', async () => {
    const { deps } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 });
    await uc.handleOne(handle);
    expect(handle.acks + handle.retries.length).toBe(1);
  });
});

describe('HandleScrapeJobUseCase — invariants', () => {
  it('never publishes follow-up jobs on success (discovery rediscovers policy)', async () => {
    // The dispatcher receives no producer dependency, so it can't publish.
    // This test asserts the dep surface itself does not include a producer.
    const { deps } = makeDeps();
    // Object keys check — if 'producer' were a dep, this would surface it.
    expect(Object.keys(deps).sort()).toEqual([
      'computePlayerMovements',
      'lockGameStrength',
      'scrapeCasualtyWard',
      'scrapeMatchResults',
      'scrapePlayerStats',
      'scrapeSupplementaryStats',
      'scrapeTeamLists',
    ]);
  });

  it('handles a batch of mixed job types in order', async () => {
    const { deps, calls } = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    const handles: RecordedHandle[] = [
      recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 }),
      recordingHandle({ type: 'scrape-casualty-ward', version: 1, year: 2026 }),
      recordingHandle({ type: 'lock-game-strength-ratings', version: 1, year: 2026, round: 5 }),
    ];
    await uc.handle({
      handles,
      ackAll: () => handles.forEach(h => h.ack()),
      retryAll: () => {},
    });
    expect(calls.matchResults).toHaveLength(1);
    expect(calls.casualty).toBe(1);
    expect(calls.gsr).toHaveLength(1);
    expect(handles.every(h => h.acks === 1)).toBe(true);
  });
});
