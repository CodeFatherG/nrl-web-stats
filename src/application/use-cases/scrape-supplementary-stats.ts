/**
 * ScrapeSupplementaryStatsUseCase — orchestrates fetching supplementary player stats
 * from nrlsupercoachstats.com and persisting them to D1.
 *
 * Checks cache first (skip if data exists and not forced), fetches via adapter, persists.
 */

import type { SupplementaryStatsSource } from '../../domain/ports/supplementary-stats-source.js';
import type { D1SupplementaryStatsRepository } from '../../infrastructure/persistence/d1-supplementary-stats-repo.js';
import type { Warning } from '../../models/types.js';
import { logger } from '../../utils/logger.js';

/** Result of a supplementary stats scrape */
export interface ScrapeSupplementaryStatsResult {
  year: number;
  round: number;
  playersScraped: number;
  matched: number;
  unmatched: number;
  cached: boolean;
  warnings: Warning[];
}

export class ScrapeSupplementaryStatsUseCase {
  constructor(
    private readonly supplementarySource: SupplementaryStatsSource,
    private readonly supplementaryRepo: D1SupplementaryStatsRepository
  ) {}

  async execute(
    year: number,
    round: number,
    force = false
  ): Promise<ScrapeSupplementaryStatsResult> {
    // Check cache — skip if data exists and not forced
    if (!force) {
      const isCached = await this.supplementaryRepo.isRoundCached(year, round);
      if (isCached) {
        logger.debug('Supplementary stats already cached, skipping', { year, round });
        return {
          year,
          round,
          playersScraped: 0,
          matched: 0,
          unmatched: 0,
          cached: true,
          warnings: [],
        };
      }
    }

    // Force re-fetch: delete existing data first
    if (force) {
      await this.supplementaryRepo.deleteRound(year, round);
    }

    // Fetch from external source
    const fetchResult = await this.supplementarySource.fetchSupplementaryStats(year, round);

    if (!fetchResult.success) {
      logger.error('Failed to fetch supplementary stats', { year, round, error: fetchResult.error });
      throw new Error(`Failed to fetch supplementary stats: ${fetchResult.error}`);
    }

    const { data: stats, warnings } = fetchResult;

    // Persist to D1
    await this.supplementaryRepo.save(stats, year, round);

    logger.info('Supplementary stats scrape complete', {
      year,
      round,
      playersScraped: stats.length,
    });

    return {
      year,
      round,
      playersScraped: stats.length,
      matched: stats.length, // All scraped players are "matched" at this stage
      unmatched: 0, // Unmatched detection happens during score computation
      cached: false,
      warnings,
    };
  }
}
