/**
 * ScrapeSupplementaryStatsUseCase — orchestrates fetching supplementary player stats
 * from nrlsupercoachstats.com and persisting them to D1.
 *
 * Checks cache first (skip if data exists and not forced), fetches via adapter, persists.
 */

import type { SupplementaryStatsSource } from '../../domain/ports/supplementary-stats-source.js';
import type { D1SupplementaryStatsRepository } from '../../infrastructure/persistence/d1-supplementary-stats-repo.js';
import type { Warning } from '../../models/types.js';
import type { JobProducer } from '../ports/job-queue.js';
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
    private readonly supplementaryRepo: D1SupplementaryStatsRepository,
    /**
     * Optional job producer. When wired, a successful scrape publishes a
     * `recompute-game-strength` job for `(year, completedRound = round)` so
     * the GSR for the next round is locked and the further-future provisional
     * entries are rebuilt without waiting for the cron-discovery tick.
     * Optional so tests that don't exercise the publish-on-success path can
     * skip wiring it (spec 036 T027).
     */
    private readonly producer?: JobProducer
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

    // Publish a recompute-game-strength job so the next round's GSR locks
    // and the further-future provisional entries are rebuilt. Failure to
    // publish is logged but does NOT fail the scrape — the cron-discovery
    // tick is the safety net (spec 036 §plan.md "Race tolerance").
    if (this.producer) {
      try {
        await this.producer.publish({
          type: 'recompute-game-strength',
          version: 1,
          year,
          completedRound: round,
        });
      } catch (publishErr) {
        logger.error('Failed to publish recompute-game-strength job after scrape', {
          year, round,
          error: publishErr instanceof Error ? publishErr.message : 'unknown',
        });
      }
    }

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
