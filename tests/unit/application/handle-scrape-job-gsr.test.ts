/**
 * T026 / T014 — Dispatcher tests for the renamed `recompute-game-strength`
 * job variant and the `ProvisionalGameStrengthStoreQuotaExhaustedError`
 * terminal classification.
 *
 * Feature: 036-game-strength-artifact.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandleScrapeJobUseCase, type HandleScrapeJobDeps } from '../../../src/application/use-cases/handle-scrape-job.js';
import { GameStrengthStoreQuotaExhaustedError } from '../../../src/domain/repositories/game-strength-repository.js';
import { ProvisionalGameStrengthStoreQuotaExhaustedError } from '../../../src/domain/repositories/provisional-game-strength-repository.js';
import type { JobBatch, JobHandle, ScrapeJob } from '../../../src/application/ports/job-queue.js';
import type { LockGameStrengthRatingsUseCase } from '../../../src/application/use-cases/lock-game-strength-ratings.js';

function makeHandle(body: ScrapeJob): JobHandle<ScrapeJob> & { acked: boolean; retried: boolean; retryDelay?: number } {
  let acked = false;
  let retried = false;
  let retryDelay: number | undefined;
  return {
    body,
    attemptCount: 1,
    ack: () => { acked = true; },
    retry: (opts?: { delaySeconds?: number }) => { retried = true; retryDelay = opts?.delaySeconds; },
    get acked() { return acked; },
    get retried() { return retried; },
    get retryDelay() { return retryDelay; },
  } as unknown as JobHandle<ScrapeJob> & { acked: boolean; retried: boolean; retryDelay?: number };
}

function makeBatch(handles: ReadonlyArray<JobHandle<ScrapeJob>>): JobBatch<ScrapeJob> {
  return {
    handles,
    ackAll: () => handles.forEach(h => h.ack()),
    retryAll: () => handles.forEach(h => h.retry()),
  };
}

function makeDeps(overrides: Partial<HandleScrapeJobDeps> = {}): HandleScrapeJobDeps {
  return {
    scrapeMatchResults: { execute: vi.fn() } as any,
    scrapePlayerStats: { execute: vi.fn() } as any,
    scrapeSupplementaryStats: { execute: vi.fn() } as any,
    scrapeTeamLists: { execute: vi.fn() } as any,
    scrapeCasualtyWard: { execute: vi.fn() } as any,
    computePlayerMovements: { execute: vi.fn() } as any,
    lockGameStrength: { execute: vi.fn() } as any,
    ...overrides,
  };
}

describe('HandleScrapeJobUseCase — recompute-game-strength dispatch (spec 036)', () => {
  it('dispatches `recompute-game-strength` to LockGameStrengthRatingsUseCase with `completedRound`', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const lockUC = { execute } as unknown as LockGameStrengthRatingsUseCase;
    const deps = makeDeps({ lockGameStrength: lockUC });
    const dispatcher = new HandleScrapeJobUseCase(deps);

    const handle = makeHandle({
      type: 'recompute-game-strength',
      version: 1,
      year: 2026,
      completedRound: 13,
    } as ScrapeJob);
    await dispatcher.handle(makeBatch([handle]));

    expect(execute).toHaveBeenCalledWith(2026, 13);
    expect(handle.acked).toBe(true);
  });

  it('classifies GameStrengthStoreQuotaExhaustedError as terminal (re-throws so platform → DLQ)', async () => {
    const execute = vi.fn().mockRejectedValue(
      new GameStrengthStoreQuotaExhaustedError('GSR provisional store quota exhausted'),
    );
    const lockUC = { execute } as unknown as LockGameStrengthRatingsUseCase;
    const deps = makeDeps({ lockGameStrength: lockUC });
    const dispatcher = new HandleScrapeJobUseCase(deps);

    const handle = makeHandle({
      type: 'recompute-game-strength',
      version: 1,
      year: 2026,
      completedRound: 13,
    } as ScrapeJob);

    let caught: unknown = null;
    try {
      await dispatcher.handle(makeBatch([handle]));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GameStrengthStoreQuotaExhaustedError);
    expect(handle.acked).toBe(false);
    expect(handle.retried).toBe(false);
  });

  it('also classifies the sub-adapter\'s ProvisionalGameStrengthStoreQuotaExhaustedError as terminal (defense-in-depth)', async () => {
    const execute = vi.fn().mockRejectedValue(
      new ProvisionalGameStrengthStoreQuotaExhaustedError('raw sub-adapter error'),
    );
    const lockUC = { execute } as unknown as LockGameStrengthRatingsUseCase;
    const deps = makeDeps({ lockGameStrength: lockUC });
    const dispatcher = new HandleScrapeJobUseCase(deps);
    const handle = makeHandle({
      type: 'recompute-game-strength',
      version: 1,
      year: 2026,
      completedRound: 13,
    } as ScrapeJob);

    let caught: unknown = null;
    try {
      await dispatcher.handle(makeBatch([handle]));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProvisionalGameStrengthStoreQuotaExhaustedError);
    expect(handle.acked).toBe(false);
  });

  it('does not handle the old `lock-game-strength-ratings` type label (schema-validation rejects it)', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const lockUC = { execute } as unknown as LockGameStrengthRatingsUseCase;
    const deps = makeDeps({ lockGameStrength: lockUC });
    const dispatcher = new HandleScrapeJobUseCase(deps);

    const handle = makeHandle({
      type: 'lock-game-strength-ratings', // OLD label (renamed in T013)
      version: 1,
      year: 2026,
      round: 14,
    } as unknown as ScrapeJob);
    await dispatcher.handle(makeBatch([handle]));

    // Schema validation rejects unknown discriminator → ack so it stops redelivering.
    expect(execute).not.toHaveBeenCalled();
    expect(handle.acked).toBe(true);
  });
});
