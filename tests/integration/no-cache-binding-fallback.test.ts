/**
 * T031 — Spec 036, User Story 3: a worker started without the `CACHE`
 * binding falls back to InMemoryProvisionalGameStrengthRepository for the
 * provisional half. Reads and writes succeed in-isolate; a fresh isolate
 * does not see another isolate's in-memory state.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryProvisionalGameStrengthRepository } from '../../src/infrastructure/persistence/in-memory-provisional-game-strength-repository.js';
import type { ProvisionalGameStrengthRepository } from '../../src/domain/repositories/provisional-game-strength-repository.js';
import type { KVNamespace } from '@cloudflare/workers-types';
import { KvProvisionalGameStrengthRepository } from '../../src/infrastructure/persistence/kv-provisional-game-strength-repository.js';
import type { RoundGSR } from '../../src/domain/game-strength.js';

function makeGSR(year: number, round: number): RoundGSR {
  return {
    year,
    round,
    leagueAvgTeamScore: 400,
    matches: [],
    methodology: {
      halfLifeRounds: 6,
      offenseWeight: 0.5,
      minRoundsForReliability: 3,
      seasonTransitionPenalty: 0,
      categoryWeightingMethod: 'dynamic',
    },
  };
}

/**
 * Mirror of the composition-root selection rule in src/worker.ts (the lines
 * just below the player-movements selection). Kept in this test file rather
 * than imported because the worker code reads `env.CACHE` from a Cloudflare
 * Env object; here we synthesise the equivalent branch directly.
 */
function selectProvisional(cache: KVNamespace | undefined): ProvisionalGameStrengthRepository {
  return cache
    ? new KvProvisionalGameStrengthRepository(cache)
    : new InMemoryProvisionalGameStrengthRepository();
}

describe('Spec 036 US3 — no-CACHE-binding fallback', () => {
  it('selects InMemoryProvisionalGameStrengthRepository when CACHE is undefined', () => {
    const repo = selectProvisional(undefined);
    expect(repo).toBeInstanceOf(InMemoryProvisionalGameStrengthRepository);
  });

  it('in-isolate read and write succeed against the in-memory fallback', async () => {
    const repo = selectProvisional(undefined);
    await repo.save(2026, 20, makeGSR(2026, 20));
    const read = await repo.findByRound(2026, 20);
    expect(read?.round).toBe(20);
    expect(read?.year).toBe(2026);
  });

  it('a fresh isolate (new in-memory repo) does NOT see another isolate\'s state', async () => {
    const isolateA = selectProvisional(undefined);
    await isolateA.save(2026, 20, makeGSR(2026, 20));
    const isolateB = selectProvisional(undefined);
    const read = await isolateB.findByRound(2026, 20);
    expect(read).toBeNull();
  });

  it('listProvisionalRounds works on the in-memory fallback', async () => {
    const repo = selectProvisional(undefined);
    await repo.save(2026, 14, makeGSR(2026, 14));
    await repo.save(2026, 15, makeGSR(2026, 15));
    const rounds = await repo.listProvisionalRounds(2026);
    expect([...rounds].sort()).toEqual([14, 15]);
  });

  it('deleteByYear works on the in-memory fallback', async () => {
    const repo = selectProvisional(undefined);
    await repo.save(2026, 14, makeGSR(2026, 14));
    await repo.deleteByYear(2026);
    expect((await repo.listProvisionalRounds(2026)).size).toBe(0);
  });
});
