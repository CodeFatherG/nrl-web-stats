/**
 * Shared contract test suite for MatchResultsScrapeWatermarkRepository
 * implementations (feature 040). Both the in-memory adapter and the KV
 * adapter call this.
 *
 * Mirrors the structure of team-strength-rankings-repository-contract.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { MatchResultsScrapeWatermarkRepository } from '../../../src/domain/repositories/match-results-scrape-watermark-repository.js';

export function runMatchResultsScrapeWatermarkRepositoryContractTests(
  makeRepo: () => MatchResultsScrapeWatermarkRepository | Promise<MatchResultsScrapeWatermarkRepository>,
): void {
  describe('MatchResultsScrapeWatermarkRepository contract', () => {
    let repo: MatchResultsScrapeWatermarkRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    describe('absent reads', () => {
      it('findByRound returns null when no watermark has been recorded', async () => {
        expect(await repo.findByRound(2026, 5)).toBeNull();
      });

      it('listScrapedRounds returns empty map for an untouched year', async () => {
        const out = await repo.listScrapedRounds(2026);
        expect(out.size).toBe(0);
      });
    });

    describe('round-trip', () => {
      it('markScraped then findByRound returns the recorded state with lastScrapedAt close to now', async () => {
        const before = Date.now();
        await repo.markScraped(2026, 5, false);
        const after = Date.now();

        const found = await repo.findByRound(2026, 5);
        expect(found).not.toBeNull();
        expect(found?.year).toBe(2026);
        expect(found?.round).toBe(5);
        expect(found?.allCompleted).toBe(false);

        const stampedAt = Date.parse(found!.lastScrapedAt);
        expect(stampedAt).toBeGreaterThanOrEqual(before);
        expect(stampedAt).toBeLessThanOrEqual(after);
      });

      it('round-trips allCompleted=true', async () => {
        await repo.markScraped(2026, 12, true);
        const found = await repo.findByRound(2026, 12);
        expect(found?.allCompleted).toBe(true);
      });

      it('a second markScraped overwrites the first for the same (year, round)', async () => {
        await repo.markScraped(2026, 3, false);
        const first = await repo.findByRound(2026, 3);
        // Small delay so lastScrapedAt advances (use a real wait — markScraped
        // sets the timestamp from Date.now() in both adapters).
        await new Promise(r => setTimeout(r, 5));
        await repo.markScraped(2026, 3, true);
        const second = await repo.findByRound(2026, 3);

        expect(second?.allCompleted).toBe(true);
        expect(Date.parse(second!.lastScrapedAt)).toBeGreaterThanOrEqual(Date.parse(first!.lastScrapedAt));
      });
    });

    describe('listScrapedRounds', () => {
      it('returns every round written for the year keyed by round number', async () => {
        await repo.markScraped(2026, 1, true);
        await repo.markScraped(2026, 2, false);
        await repo.markScraped(2026, 5, true);

        const out = await repo.listScrapedRounds(2026);
        expect(out.size).toBe(3);
        expect(out.get(1)?.allCompleted).toBe(true);
        expect(out.get(2)?.allCompleted).toBe(false);
        expect(out.get(5)?.allCompleted).toBe(true);
      });

      it('excludes rounds written for other years', async () => {
        await repo.markScraped(2025, 7, true);
        await repo.markScraped(2026, 4, false);

        const out2025 = await repo.listScrapedRounds(2025);
        const out2026 = await repo.listScrapedRounds(2026);

        expect(out2025.size).toBe(1);
        expect(out2025.has(7)).toBe(true);
        expect(out2025.has(4)).toBe(false);

        expect(out2026.size).toBe(1);
        expect(out2026.has(4)).toBe(true);
        expect(out2026.has(7)).toBe(false);
      });

      it('reflects last-write-wins after a subsequent markScraped', async () => {
        await repo.markScraped(2026, 9, false);
        await repo.markScraped(2026, 9, true);
        const out = await repo.listScrapedRounds(2026);
        expect(out.size).toBe(1);
        expect(out.get(9)?.allCompleted).toBe(true);
      });
    });
  });
}
