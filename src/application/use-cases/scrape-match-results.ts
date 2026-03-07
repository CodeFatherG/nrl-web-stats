/**
 * ScrapeMatchResultsUseCase — fetches match results from an external source
 * and enriches or creates Match aggregates in the repository.
 */

import type { MatchResultSource, MatchResult } from '../../domain/ports/match-result-source.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import { enrichWithResult, createMatchFromResult, MatchStatus } from '../../domain/match.js';
import type { ResultData } from '../../domain/match.js';
import type { Warning } from '../../models/types.js';
import type { ResultCacheStore } from '../../cache/result-cache.js';
import { logger } from '../../utils/logger.js';

/** Buffer time after kick-off to estimate game completion (2 hours) */
const COMPLETION_BUFFER_MS = 2 * 60 * 60 * 1000;

/** Result of a match results scrape operation */
export interface ScrapeMatchResultsResult {
  success: boolean;
  year: number;
  round?: number;
  enrichedCount: number;
  createdCount: number;
  skippedCount: number;
  warnings: Warning[];
}

export class ScrapeMatchResultsUseCase {
  constructor(
    private readonly matchResultSource: MatchResultSource,
    private readonly matchRepository: MatchRepository,
    private readonly resultCache?: ResultCacheStore
  ) {}

  async execute(year: number, round?: number): Promise<ScrapeMatchResultsResult> {
    // Check result cache if round is specified
    if (round !== undefined && this.resultCache?.isCached(year, round)) {
      logger.debug('Result cache hit, skipping fetch', { year, round });
      return {
        success: true,
        year,
        round,
        enrichedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        warnings: [],
      };
    }

    const fetchResult = await this.matchResultSource.fetchResults(year, round);

    if (!fetchResult.success) {
      logger.error('Failed to fetch match results', { year, round, error: fetchResult.error });
      return {
        success: false,
        year,
        round,
        enrichedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        warnings: [],
      };
    }

    const { data: matchResults, warnings } = fetchResult;
    let enrichedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;

    for (const result of matchResults) {
      const existingMatch = this.matchRepository.findById(result.matchId);

      const resultData: ResultData = {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        status: result.status,
        scheduledTime: result.scheduledTime,
      };

      if (existingMatch) {
        const enrichedMatch = enrichWithResult(existingMatch, resultData);
        this.matchRepository.save(enrichedMatch);
        enrichedCount++;
      } else {
        const newMatch = createMatchFromResult({
          ...resultData,
          teamA: result.homeTeamCode,
          teamB: result.awayTeamCode,
          year: result.year,
          round: result.round,
        });
        this.matchRepository.save(newMatch);
        createdCount++;
      }
    }

    // Update result cache if round is specified
    if (round !== undefined && this.resultCache) {
      const allCompleted = matchResults.length > 0 &&
        matchResults.every(r => r.status === MatchStatus.Completed);
      this.resultCache.markScraped(year, round, allCompleted);
    }

    logger.info('Match results scrape complete', {
      year,
      round,
      enrichedCount,
      createdCount,
      skippedCount,
      warningCount: warnings.length,
    });

    return {
      success: true,
      year,
      round,
      enrichedCount,
      createdCount,
      skippedCount,
      warnings,
    };
  }
}

/**
 * T023: Find rounds that need result scraping based on scheduled kick-off times.
 * A round needs scraping when any match has scheduledTime + 2h buffer < currentTime
 * AND the match status is still Scheduled (not yet scraped).
 * Skips rounds where all matches are already Completed.
 */
export function findRoundsNeedingScrape(
  matchRepository: MatchRepository,
  currentTime: Date
): Array<{ year: number; round: number }> {
  const loadedYears = matchRepository.getLoadedYears();
  if (loadedYears.length === 0) return [];

  const roundsNeeding: Array<{ year: number; round: number }> = [];
  const seen = new Set<string>();

  for (const year of loadedYears) {
    const matches = matchRepository.findByYear(year);

    // Group matches by round
    const roundMatches = new Map<number, typeof matches>();
    for (const match of matches) {
      if (!roundMatches.has(match.round)) {
        roundMatches.set(match.round, []);
      }
      roundMatches.get(match.round)!.push(match);
    }

    for (const [round, roundMatchList] of roundMatches) {
      const key = `${year}-${round}`;
      if (seen.has(key)) continue;

      // Skip if all matches in round are Completed
      const allCompleted = roundMatchList.every(m => m.status === MatchStatus.Completed);
      if (allCompleted) continue;

      // Check if any match has a scheduledTime that's past completion buffer
      const hasCompletableMatch = roundMatchList.some(m => {
        if (!m.scheduledTime || m.status === MatchStatus.Completed) return false;
        const estimatedCompletion = new Date(m.scheduledTime).getTime() + COMPLETION_BUFFER_MS;
        return currentTime.getTime() > estimatedCompletion;
      });

      if (hasCompletableMatch) {
        seen.add(key);
        roundsNeeding.push({ year, round });
      }
    }
  }

  return roundsNeeding.sort((a, b) => a.year - b.year || a.round - b.round);
}
