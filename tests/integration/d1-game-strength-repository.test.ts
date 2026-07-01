/**
 * T012 — Integration test for D1GameStrengthRepository under Miniflare.
 *
 * Covers the new `findLockedRoundsForYear` method added by feature 036.
 * `findByRound` and `save` are exercised indirectly by other tests
 * (lock-game-strength-ratings, recompute-game-strength-flow); the focus
 * here is the new method.
 *
 * Feature: 036-game-strength-artifact (T012).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { D1Database } from '@cloudflare/workers-types';
import { D1GameStrengthRepository } from '../../src/infrastructure/persistence/d1-game-strength-repository.js';
import type { RoundGSR } from '../../src/domain/game-strength.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

describe('D1GameStrengthRepository', () => {
  let mf: Miniflare;
  let db: D1Database;
  let repo: D1GameStrengthRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });
    db = (await mf.getD1Database('DB')) as unknown as D1Database;
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    const sql = fs.readFileSync(
      path.join(migrationsDir, '0013_add_game_strength_ratings.sql'),
      'utf-8',
    );
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter((s) => s.length > 0);
    await db.batch(statements.map((s) => db.prepare(s)));
    repo = new D1GameStrengthRepository(db);
  });

  it('findLockedRoundsForYear returns empty set when no rows exist', async () => {
    const rounds = await repo.findLockedRoundsForYear(2026);
    expect(rounds.size).toBe(0);
  });

  it('findLockedRoundsForYear returns only the requested year\'s rounds', async () => {
    await repo.save(2025, 27, makeGSR(2025, 27));
    await repo.save(2026, 1, makeGSR(2026, 1));
    await repo.save(2026, 5, makeGSR(2026, 5));
    await repo.save(2026, 14, makeGSR(2026, 14));
    await repo.save(2027, 3, makeGSR(2027, 3));

    const rounds2026 = await repo.findLockedRoundsForYear(2026);
    expect([...rounds2026].sort((a, b) => a - b)).toEqual([1, 5, 14]);

    const rounds2025 = await repo.findLockedRoundsForYear(2025);
    expect([...rounds2025]).toEqual([27]);

    const rounds2028 = await repo.findLockedRoundsForYear(2028);
    expect(rounds2028.size).toBe(0);
  });

  it('findLockedRoundsForYear returns a set (no duplicates) — sanity check', async () => {
    await repo.save(2026, 5, makeGSR(2026, 5));
    const rounds = await repo.findLockedRoundsForYear(2026);
    expect(rounds.size).toBe(1);
    expect(rounds.has(5)).toBe(true);
  });
});
