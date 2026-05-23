/**
 * Shared contract test suite for FixtureRepository implementations.
 *
 * Both the in-memory adapter and the KV adapter (Miniflare) call into this
 * suite via the `runFixtureRepositoryContract(makeRepo)` factory.
 *
 * Feature: 038-kv-fixture-repository (T008).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { FixtureRepository } from '../../../src/domain/repositories/fixture-repository.js';
import type { Fixture } from '../../../src/models/fixture.js';
import { createFixture } from '../../../src/models/fixture.js';

function fx(
  year: number,
  round: number,
  teamCode: string,
  opponentCode: string | null,
  isHome = true,
  strengthRating = 100,
): Fixture {
  return createFixture(year, round, teamCode, opponentCode, isHome, strengthRating);
}

export function runFixtureRepositoryContract(
  makeRepo: () => FixtureRepository | Promise<FixtureRepository>,
): void {
  describe('FixtureRepository contract', () => {
    let repo: FixtureRepository;
    let testStartedAt: number;

    beforeEach(async () => {
      repo = await makeRepo();
      testStartedAt = Date.now();
    });

    it('returns null when no artifact has been written for the year', async () => {
      const result = await repo.findByYear(2026);
      expect(result).toBeNull();
    });

    it('save → findByYear returns an artifact whose payload equals the saved fixtures', async () => {
      const fixtures = [fx(2026, 1, 'BRI', 'SYD'), fx(2026, 1, 'SYD', 'BRI', false)];
      await repo.save(2026, fixtures);
      const artifact = await repo.findByYear(2026);
      expect(artifact).not.toBeNull();
      expect(artifact!.year).toBe(2026);
      expect(artifact!.payload).toEqual(fixtures);
    });

    it('save stamps lastScrapedAt to a timestamp within the test execution window', async () => {
      await repo.save(2026, [fx(2026, 1, 'BRI', 'SYD')]);
      const artifact = await repo.findByYear(2026);
      expect(artifact).not.toBeNull();
      const lastScrapedAt = Date.parse(artifact!.freshness.lastScrapedAt);
      expect(lastScrapedAt).toBeGreaterThanOrEqual(testStartedAt - 1000);
      expect(lastScrapedAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('save is last-write-wins: a second save replaces the first', async () => {
      await repo.save(2026, [fx(2026, 1, 'BRI', 'SYD')]);
      const second = [fx(2026, 2, 'MEL', 'BRI'), fx(2026, 2, 'BRI', 'MEL', false)];
      await repo.save(2026, second);
      const artifact = await repo.findByYear(2026);
      expect(artifact).not.toBeNull();
      expect(artifact!.payload).toEqual(second);
    });

    it('findByYearAndTeam filters payload to the requested team', async () => {
      const fixtures = [
        fx(2026, 1, 'BRI', 'SYD'),
        fx(2026, 1, 'SYD', 'BRI', false),
        fx(2026, 2, 'BRI', 'MEL'),
        fx(2026, 2, 'MEL', 'BRI', false),
      ];
      await repo.save(2026, fixtures);
      const result = await repo.findByYearAndTeam(2026, 'BRI');
      expect(result).not.toBeNull();
      expect(result!.payload.length).toBe(2);
      for (const f of result!.payload) expect(f.teamCode).toBe('BRI');
    });

    it('findByYearAndTeam returns artifact with empty payload when team has no fixtures (not null)', async () => {
      await repo.save(2026, [fx(2026, 1, 'BRI', 'SYD'), fx(2026, 1, 'SYD', 'BRI', false)]);
      const result = await repo.findByYearAndTeam(2026, 'MEL');
      expect(result).not.toBeNull();
      expect(result!.payload).toEqual([]);
    });

    it('listScrapedYears returns an empty map before any save', async () => {
      const result = await repo.listScrapedYears();
      expect(result.size).toBe(0);
    });

    it('listScrapedYears returns each saved year with its lastScrapedAt', async () => {
      await repo.save(2025, [fx(2025, 1, 'BRI', 'SYD')]);
      await repo.save(2026, [fx(2026, 1, 'MEL', 'BRI')]);
      const result = await repo.listScrapedYears();
      expect(result.size).toBe(2);
      expect(result.has(2025)).toBe(true);
      expect(result.has(2026)).toBe(true);
      for (const [, ts] of result) {
        expect(typeof ts).toBe('string');
        expect(() => new Date(ts).toISOString()).not.toThrow();
      }
    });
  });
}
