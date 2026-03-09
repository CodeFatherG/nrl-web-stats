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
    // When no round specified, discover rounds from the repository and scrape each
    if (round === undefined) {
      return this.executeAllRounds(year);
    }
    return this.executeSingleRound(year, round);
  }

  private async executeAllRounds(year: number): Promise<ScrapeMatchResultsResult> {
    const matches = await this.matchRepository.findByYear(year);
    const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);

    if (rounds.length === 0) {
      logger.info('No rounds found in repository to scrape results for', { year });
      return { success: true, year, enrichedCount: 0, createdCount: 0, skippedCount: 0, warnings: [] };
    }

    let totalEnriched = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    const allWarnings: Warning[] = [];

    for (const r of rounds) {
      const result = await this.executeSingleRound(year, r);
      totalEnriched += result.enrichedCount;
      totalCreated += result.createdCount;
      totalSkipped += result.skippedCount;
      allWarnings.push(...result.warnings);
    }

    logger.info('All-rounds match results scrape complete', {
      year,
      roundsScraped: rounds.length,
      totalEnriched,
      totalCreated,
      totalSkipped,
    });

    return {
      success: true,
      year,
      enrichedCount: totalEnriched,
      createdCount: totalCreated,
      skippedCount: totalSkipped,
      warnings: allWarnings,
    };
  }

  private async executeSingleRound(year: number, round: number): Promise<ScrapeMatchResultsResult> {
    // Check result cache
    if (this.resultCache?.isCached(year, round)) {
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
      const existingMatch = await this.matchRepository.findById(result.matchId);

      const resultData: ResultData = {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        status: result.status,
        scheduledTime: result.scheduledTime,
        stadium: result.stadium ?? null,
        weather: result.weather ?? null,
      };

      if (existingMatch) {
        const enrichedMatch = enrichWithResult(existingMatch, resultData);
        await this.matchRepository.save(enrichedMatch);
        enrichedCount++;
      } else {
        const newMatch = createMatchFromResult({
          ...resultData,
          teamA: result.homeTeamCode,
          teamB: result.awayTeamCode,
          year: result.year,
          round: result.round,
        });
        await this.matchRepository.save(newMatch);
        createdCount++;
      }
    }

    // Update result cache
    if (this.resultCache) {
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
export async function findRoundsNeedingScrape(
  matchRepository: MatchRepository,
  currentTime: Date
): Promise<Array<{ year: number; round: number }>> {
  const loadedYears = await matchRepository.getLoadedYears();
  if (loadedYears.length === 0) return [];

  const roundsNeeding: Array<{ year: number; round: number }> = [];
  const seen = new Set<string>();

  for (const year of loadedYears) {
    const matches = await matchRepository.findByYear(year);

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
