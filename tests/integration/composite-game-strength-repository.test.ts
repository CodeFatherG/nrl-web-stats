/**
 * Integration test for CompositeGameStrengthRepository — exercises the
 * locked-first read ordering, lockedAt surfacing, and the quota-exhausted
 * re-wrap behaviour across the D1 + KV sub-adapter boundary.
 *
 * Feature: 036-game-strength-artifact (composite refactor).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { CompositeGameStrengthRepository } from '../../src/infrastructure/persistence/composite-game-strength-repository.js';
import { D1GameStrengthRepository } from '../../src/infrastructure/persistence/d1-game-strength-repository.js';
import { KvProvisionalGameStrengthRepository } from '../../src/infrastructure/persistence/kv-provisional-game-strength-repository.js';
import { InMemoryProvisionalGameStrengthRepository } from '../../src/infrastructure/persistence/in-memory-provisional-game-strength-repository.js';
import { GameStrengthStoreQuotaExhaustedError } from '../../src/domain/repositories/game-strength-repository.js';
import type { RoundGSR } from '../../src/domain/game-strength.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeGSR(year: number, round: number, leagueAvg = 400): RoundGSR {
  return {
    year,
    round,
    leagueAvgTeamScore: leagueAvg,
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

describe('CompositeGameStrengthRepository', () => {
  let mf: Miniflare;
  let db: D1Database;
  let kv: KVNamespace;
  let composite: CompositeGameStrengthRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
      kvNamespaces: ['CACHE'],
    });
    db = (await mf.getD1Database('DB')) as unknown as D1Database;
    kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/0013_add_game_strength_ratings.sql'),
      'utf-8',
    );
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(s => db.prepare(s)));
    composite = new CompositeGameStrengthRepository(
      new D1GameStrengthRepository(db),
      new KvProvisionalGameStrengthRepository(kv),
    );
  });

  it('read returns null when neither store has the artifact', async () => {
    await expect(composite.read(2026, 5)).resolves.toBeNull();
  });

  it('read returns locked=true with lockedAt when D1 has the row', async () => {
    await composite.writeLocked(2026, 5, makeGSR(2026, 5, 1800));
    const result = await composite.read(2026, 5);
    expect(result?.locked).toBe(true);
    expect(result?.lockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result?.gsr.leagueAvgTeamScore).toBe(1800);
  });

  it('read returns locked=false with lockedAt=null when only the provisional store has the artifact', async () => {
    await composite.writeProvisional(2026, 20, makeGSR(2026, 20, 1900));
    const result = await composite.read(2026, 20);
    expect(result?.locked).toBe(false);
    expect(result?.lockedAt).toBeNull();
    expect(result?.gsr.leagueAvgTeamScore).toBe(1900);
  });

  it('read prefers D1 (locked) over KV (provisional) when both have entries for the same round', async () => {
    // Pre-populate both stores with different bytes to verify the read ordering.
    await composite.writeLocked(2026, 5, makeGSR(2026, 5, 1800));     // canonical
    await composite.writeProvisional(2026, 5, makeGSR(2026, 5, 9999)); // stale shadow
    const result = await composite.read(2026, 5);
    expect(result?.locked).toBe(true);
    expect(result?.gsr.leagueAvgTeamScore).toBe(1800); // D1 wins
  });

  it('writeLocked is INSERT OR IGNORE (second call does not overwrite)', async () => {
    await composite.writeLocked(2026, 5, makeGSR(2026, 5, 1800));
    await composite.writeLocked(2026, 5, makeGSR(2026, 5, 9999)); // would overwrite if not IGNORE
    const result = await composite.read(2026, 5);
    expect(result?.gsr.leagueAvgTeamScore).toBe(1800); // first write wins
  });

  it('listLockedRounds returns only D1-backed rounds for the requested year', async () => {
    await composite.writeLocked(2026, 1, makeGSR(2026, 1));
    await composite.writeLocked(2026, 14, makeGSR(2026, 14));
    await composite.writeLocked(2025, 27, makeGSR(2025, 27));
    await composite.writeProvisional(2026, 20, makeGSR(2026, 20)); // SHOULD NOT appear
    const rounds = await composite.listLockedRounds(2026);
    expect([...rounds].sort((a, b) => a - b)).toEqual([1, 14]);
  });

  it('listProvisionalRounds returns only KV-backed rounds for the requested year', async () => {
    await composite.writeProvisional(2026, 14, makeGSR(2026, 14));
    await composite.writeProvisional(2026, 15, makeGSR(2026, 15));
    await composite.writeLocked(2026, 1, makeGSR(2026, 1)); // SHOULD NOT appear
    const rounds = await composite.listProvisionalRounds(2026);
    expect([...rounds].sort((a, b) => a - b)).toEqual([14, 15]);
  });

  it('deleteAllProvisional wipes the year\'s KV entries but does not touch D1', async () => {
    await composite.writeLocked(2026, 1, makeGSR(2026, 1));
    await composite.writeProvisional(2026, 14, makeGSR(2026, 14));
    await composite.writeProvisional(2026, 15, makeGSR(2026, 15));
    await composite.deleteAllProvisional(2026);
    expect((await composite.listProvisionalRounds(2026)).size).toBe(0);
    expect((await composite.listLockedRounds(2026)).size).toBe(1); // D1 untouched
  });

  it('quota-exhausted on writeProvisional is re-wrapped as GameStrengthStoreQuotaExhaustedError', async () => {
    // Build a composite whose KV sub-adapter throws on put.
    const stubKv = {
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      put: async () => { throw new Error('KV PUT failed: 429 daily limit exceeded'); },
      delete: async () => {},
    } as unknown as KVNamespace;
    const stubComposite = new CompositeGameStrengthRepository(
      new D1GameStrengthRepository(db),
      new KvProvisionalGameStrengthRepository(stubKv),
    );
    let caught: unknown = null;
    try {
      await stubComposite.writeProvisional(2026, 20, makeGSR(2026, 20));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GameStrengthStoreQuotaExhaustedError);
  });
});

describe('CompositeGameStrengthRepository — in-memory fallback', () => {
  it('composes with InMemoryProvisionalGameStrengthRepository when no KV binding is available', async () => {
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });
    const db = (await mf.getD1Database('DB')) as unknown as D1Database;
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/0013_add_game_strength_ratings.sql'),
      'utf-8',
    );
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(s => db.prepare(s)));
    const composite = new CompositeGameStrengthRepository(
      new D1GameStrengthRepository(db),
      new InMemoryProvisionalGameStrengthRepository(),
    );
    await composite.writeProvisional(2026, 20, makeGSR(2026, 20, 2222));
    const result = await composite.read(2026, 20);
    expect(result?.locked).toBe(false);
    expect(result?.gsr.leagueAvgTeamScore).toBe(2222);
  });
});
