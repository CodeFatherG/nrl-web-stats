/**
 * T015 — Tests for HandleScrapeJobUseCase error classification of the
 * domain-level ProjectionStoreQuotaExhaustedError.
 *
 * The full classification suite for the other error families lives in
 * tests/unit/queue/handle-scrape-job.test.ts. This file covers just the
 * spec-034 addition.
 *
 * Feature: 034-precomputed-projections.
 */

import { describe, it, expect } from 'vitest';
import {
  HandleScrapeJobUseCase,
  type HandleScrapeJobDeps,
} from '../../src/application/use-cases/handle-scrape-job.js';
import type { JobHandle, ScrapeJob } from '../../src/application/ports/job-queue.js';
import { ProjectionStoreQuotaExhaustedError } from '../../src/domain/repositories/projection-repository.js';

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

function makeThrowingDeps(err: Error): HandleScrapeJobDeps {
  const throwingExec = async () => {
    throw err;
  };
  return {
    scrapeMatchResults: { execute: throwingExec } as any,
    scrapePlayerStats: { execute: throwingExec } as any,
    scrapeSupplementaryStats: { execute: throwingExec } as any,
    scrapeTeamLists: { execute: throwingExec } as any,
    scrapeCasualtyWard: { execute: throwingExec } as any,
    computePlayerMovements: { execute: throwingExec } as any,
    lockGameStrength: { execute: throwingExec } as any,
  } as unknown as HandleScrapeJobDeps;
}

describe('HandleScrapeJobUseCase — ProjectionStoreQuotaExhaustedError classification', () => {
  it('classifies ProjectionStoreQuotaExhaustedError as terminal (no retry)', async () => {
    const err = new ProjectionStoreQuotaExhaustedError(
      'KV daily write quota exhausted while writing projections:v1:2026:player:p:1',
    );
    const uc = new HandleScrapeJobUseCase(makeThrowingDeps(err));
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 });

    await expect(uc.handleOne(handle)).rejects.toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
    expect(handle.retries).toHaveLength(0);
    expect(handle.acks).toBe(0);
  });

  it('the quota check runs before the 429-regex branch so quota always goes terminal', async () => {
    // A bare 429 would normally be classified as retry; the quota wrapper
    // overrides that decision because the daily budget cannot replenish via retry.
    const err = new ProjectionStoreQuotaExhaustedError(
      'KV PUT failed: 429 Too Many Requests — daily limit',
    );
    const uc = new HandleScrapeJobUseCase(makeThrowingDeps(err));
    const handle = recordingHandle({ type: 'scrape-match-results', version: 1, year: 2026, round: 1 });

    await expect(uc.handleOne(handle)).rejects.toBeInstanceOf(ProjectionStoreQuotaExhaustedError);
    expect(handle.retries).toHaveLength(0);
  });
});
