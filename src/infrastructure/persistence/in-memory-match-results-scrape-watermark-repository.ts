/**
 * InMemoryMatchResultsScrapeWatermarkRepository — process-local fallback for
 * `MatchResultsScrapeWatermarkRepository` (feature 040). Used when no CACHE
 * KV binding is configured (local dev, tests). Contents do not survive
 * isolate recycling.
 */

import type {
  MatchResultsScrapeWatermark,
  MatchResultsScrapeWatermarkRepository,
} from '../../domain/repositories/match-results-scrape-watermark-repository.js';
import { keyFor } from './match-results-scrape-watermark-envelope.js';

export class InMemoryMatchResultsScrapeWatermarkRepository
  implements MatchResultsScrapeWatermarkRepository {
  private readonly watermarks = new Map<string, MatchResultsScrapeWatermark>();

  async findByRound(year: number, round: number): Promise<MatchResultsScrapeWatermark | null> {
    return this.watermarks.get(keyFor(year, round)) ?? null;
  }

  async markScraped(year: number, round: number, allCompleted: boolean): Promise<void> {
    this.watermarks.set(keyFor(year, round), {
      year,
      round,
      lastScrapedAt: new Date().toISOString(),
      allCompleted,
    });
  }

  async listScrapedRounds(year: number): Promise<Map<number, MatchResultsScrapeWatermark>> {
    const out = new Map<number, MatchResultsScrapeWatermark>();
    for (const watermark of this.watermarks.values()) {
      if (watermark.year === year) {
        out.set(watermark.round, watermark);
      }
    }
    return out;
  }
}
