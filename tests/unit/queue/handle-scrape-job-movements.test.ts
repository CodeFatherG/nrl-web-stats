/**
 * T025 — dispatcher classification for player-movements quota exhaustion.
 *
 * Feature: 035-player-movements-artifact.
 *
 * Asserts:
 *   - `PlayerMovementsStoreQuotaExhaustedError` thrown by the use case is
 *     classified terminal (re-thrown so the platform counts the attempt → DLQ).
 *   - A generic non-quota error from the same use case follows the standard
 *     retry path.
 */

import { describe, it, expect } from 'vitest';
import {
  HandleScrapeJobUseCase,
  type HandleScrapeJobDeps,
} from '../../../src/application/use-cases/handle-scrape-job.js';
import { PlayerMovementsStoreQuotaExhaustedError } from '../../../src/domain/repositories/player-movements-repository.js';
import type { JobHandle, ScrapeJob } from '../../../src/application/ports/job-queue.js';

interface RecordedHandle extends JobHandle<ScrapeJob> {
  acks: number;
  retries: Array<{ delaySeconds?: number }>;
}

function recordingHandle(body: ScrapeJob): RecordedHandle {
  const state = { settled: false };
  const h: RecordedHandle = {
    body,
    attemptCount: 1,
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

function makeDeps(movementsErr?: Error): HandleScrapeJobDeps {
  return {
    scrapeMatchResults: { execute: async () => ({}) } as any,
    scrapePlayerStats: { execute: async () => ({}) } as any,
    scrapeSupplementaryStats: { execute: async () => ({}) } as any,
    scrapeTeamLists: { execute: async () => ({}) } as any,
    scrapeCasualtyWard: { execute: async () => ({}) } as any,
    computePlayerMovements: {
      execute: async () => {
        if (movementsErr) throw movementsErr;
      },
    } as any,
    lockGameStrength: { execute: async () => ({}) } as any,
  };
}

describe('HandleScrapeJobUseCase — player-movements quota classification', () => {
  it('re-throws PlayerMovementsStoreQuotaExhaustedError as terminal (no retry, no ack)', async () => {
    const deps = makeDeps(
      new PlayerMovementsStoreQuotaExhaustedError('KV daily write quota exhausted while writing player-movements:v1:2026:5'),
    );
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({
      type: 'compute-player-movements',
      version: 1,
      year: 2026,
      round: 5,
    });
    await expect(uc.handleOne(handle)).rejects.toBeInstanceOf(
      PlayerMovementsStoreQuotaExhaustedError,
    );
    expect(handle.acks).toBe(0);
    expect(handle.retries).toHaveLength(0);
  });

  it('retries with delay on a transient (HTTP 5xx) error from the movements use case', async () => {
    const deps = makeDeps(new Error('Failed: HTTP 503 Service Unavailable'));
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({
      type: 'compute-player-movements',
      version: 1,
      year: 2026,
      round: 5,
    });
    await uc.handleOne(handle);
    expect(handle.acks).toBe(0);
    expect(handle.retries).toHaveLength(1);
    expect(handle.retries[0].delaySeconds).toBeGreaterThan(0);
  });

  it('routes a clean compute-player-movements job to ack (no error path)', async () => {
    const deps = makeDeps();
    const uc = new HandleScrapeJobUseCase(deps);
    const handle = recordingHandle({
      type: 'compute-player-movements',
      version: 1,
      year: 2026,
      round: 5,
    });
    await uc.handleOne(handle);
    expect(handle.acks).toBe(1);
    expect(handle.retries).toHaveLength(0);
  });
});
