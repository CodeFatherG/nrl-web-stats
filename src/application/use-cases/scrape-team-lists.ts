/**
 * ScrapeTeamListsUseCase — fetches team list (lineup) data from an external source
 * and persists it in the team list repository.
 *
 * Supports three modes:
 * 1. Initial scrape: Fetch team lists for all matches in a round
 * 2. Window-based update: Re-fetch for matches within 24h or 90min of kickoff
 * 3. Backfill: Populate team lists for completed matches missing data
 */

import type { TeamListSource } from '../../domain/ports/team-list-source.js';
import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import { MatchStatus } from '../../domain/match.js';
import type { Warning } from '../../models/types.js';
import { logger } from '../../utils/logger.js';

/** Result of a team list scrape operation */
export interface ScrapeTeamListsResult {
  success: boolean;
  year: number;
  round?: number;
  scrapedCount: number;
  skippedCount: number;
  backfilledCount: number;
  warnings: Warning[];
}

export class ScrapeTeamListsUseCase {
  constructor(
    private readonly teamListSource: TeamListSource,
    private readonly teamListRepository: TeamListRepository,
    private readonly matchRepository: MatchRepository
  ) {}

  /** Scrape team lists for a specific round (or all rounds if not specified). */
  async execute(year: number, round?: number): Promise<ScrapeTeamListsResult> {
    if (round !== undefined) {
      return this.executeSingleRound(year, round);
    }
    return this.executeAllRounds(year);
  }

  private async executeSingleRound(year: number, round: number): Promise<ScrapeTeamListsResult> {
    const warnings: Warning[] = [];
    let scrapedCount = 0;
    let skippedCount = 0;

    // Fetch team lists from external source
    const result = await this.teamListSource.fetchTeamLists(year, round);

    if (!result.success) {
      logger.error('Failed to fetch team lists', { year, round, error: result.error });
      return { success: false, year, round, scrapedCount: 0, skippedCount: 0, backfilledCount: 0, warnings: [] };
    }

    warnings.push(...result.warnings);

    if (result.data.length === 0) {
      logger.info('No team lists available for round', { year, round });
      return { success: true, year, round, scrapedCount: 0, skippedCount: 0, backfilledCount: 0, warnings };
    }

    // Get match data to determine save behavior
    const matches = await this.matchRepository.findByYearAndRound(year, round);
    const matchMap = new Map(matches.map(m => [m.id, m]));

    // Pre-fetch existing team lists for the round to check scrapedAt timestamps
    const existingTeamLists = await this.teamListRepository.findByYearAndRound(year, round);
    const existingMap = new Map(existingTeamLists.map(tl => [`${tl.matchId}::${tl.teamCode}`, tl]));

    for (const teamList of result.data) {
      const match = matchMap.get(teamList.matchId);

      // For completed matches, allow re-scrape if the stored team list was scraped
      // before kickoff (pre-match list may not reflect late changes like withdrawals
      // or position moves). Skip only if already scraped after the match started.
      if (match?.status === MatchStatus.Completed) {
        const existing = existingMap.get(`${teamList.matchId}::${teamList.teamCode}`);
        if (existing) {
          const scrapedAt = new Date(existing.scrapedAt).getTime();
          const kickoff = match.scheduledTime ? new Date(match.scheduledTime).getTime() : 0;
          if (scrapedAt >= kickoff) {
            skippedCount++;
            continue;
          }
          // Pre-match team list — replace with post-match actual team
          logger.info('Replacing pre-match team list with post-match data', {
            matchId: teamList.matchId,
            teamCode: teamList.teamCode,
            oldScrapedAt: existing.scrapedAt,
            scheduledTime: match.scheduledTime,
          });
        }
      }

      await this.teamListRepository.save(teamList);
      scrapedCount++;
    }

    logger.info('Team list scrape complete', {
      year,
      round,
      scrapedCount,
      skippedCount,
      warnings: warnings.length,
    });

    return { success: true, year, round, scrapedCount, skippedCount, backfilledCount: 0, warnings };
  }

  private async executeAllRounds(year: number): Promise<ScrapeTeamListsResult> {
    const matches = await this.matchRepository.findByYear(year);
    const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);

    if (rounds.length === 0) {
      return { success: true, year, scrapedCount: 0, skippedCount: 0, backfilledCount: 0, warnings: [] };
    }

    let totalScraped = 0;
    let totalSkipped = 0;
    const allWarnings: Warning[] = [];

    for (const r of rounds) {
      const result = await this.executeSingleRound(year, r);
      totalScraped += result.scrapedCount;
      totalSkipped += result.skippedCount;
      allWarnings.push(...result.warnings);
    }

    return {
      success: true,
      year,
      scrapedCount: totalScraped,
      skippedCount: totalSkipped,
      backfilledCount: 0,
      warnings: allWarnings,
    };
  }

  /**
   * Find matches within an update window and re-scrape their team lists.
   * @param windowMs Time window in milliseconds before scheduledTime
   */
  async scrapeMatchesInWindow(year: number, windowMs: number, currentTime: Date): Promise<ScrapeTeamListsResult> {
    const matches = await this.matchRepository.findByYear(year);
    const warnings: Warning[] = [];
    let scrapedCount = 0;
    let skippedCount = 0;

    const now = currentTime.getTime();

    // Find matches where scheduledTime - windowMs <= now <= scheduledTime
    const matchesInWindow = matches.filter(m => {
      if (!m.scheduledTime) return false;
      if (m.status === MatchStatus.Completed) return false;
      const kickoff = new Date(m.scheduledTime).getTime();
      return kickoff - windowMs <= now && now <= kickoff;
    });

    if (matchesInWindow.length === 0) {
      return { success: true, year, scrapedCount: 0, skippedCount: 0, backfilledCount: 0, warnings };
    }

    // Group by round for efficient fetching
    const roundSet = new Set(matchesInWindow.map(m => m.round));

    for (const round of roundSet) {
      const result = await this.teamListSource.fetchTeamLists(year, round);
      if (!result.success) {
        warnings.push({
          type: 'WINDOW_SCRAPE_FAILED',
          message: `Failed to fetch team lists for round ${round}: ${result.error}`,
          context: { year, round },
        });
        continue;
      }

      warnings.push(...result.warnings);

      // Only save team lists for matches in the window
      const windowMatchIds = new Set(matchesInWindow.filter(m => m.round === round).map(m => m.id));

      for (const teamList of result.data) {
        if (!windowMatchIds.has(teamList.matchId)) {
          skippedCount++;
          continue;
        }
        await this.teamListRepository.save(teamList);
        scrapedCount++;
      }
    }

    logger.info('Window-based team list scrape complete', {
      year,
      windowMs,
      matchesInWindow: matchesInWindow.length,
      scrapedCount,
      skippedCount,
    });

    return { success: true, year, scrapedCount, skippedCount, backfilledCount: 0, warnings };
  }

  /** Backfill team lists for completed matches that are missing data or have stale pre-match data. */
  async backfillCompleted(year: number): Promise<ScrapeTeamListsResult> {
    const matches = await this.matchRepository.findByYear(year);
    const completedMatches = matches.filter(m => m.status === MatchStatus.Completed);
    const warnings: Warning[] = [];
    let backfilledCount = 0;
    let skippedCount = 0;

    // Check which completed matches need team lists:
    // 1. No team list data at all
    // 2. Team list was scraped before kickoff (pre-match list, may not reflect late changes)
    const matchesNeedingBackfill = [];
    for (const match of completedMatches) {
      const teamLists = await this.teamListRepository.findByMatch(match.id);
      if (teamLists.length === 0) {
        matchesNeedingBackfill.push(match);
        continue;
      }
      // Check if any stored team list was scraped before kickoff
      if (match.scheduledTime) {
        const kickoff = new Date(match.scheduledTime).getTime();
        const hasPreMatchList = teamLists.some(tl => new Date(tl.scrapedAt).getTime() < kickoff);
        if (hasPreMatchList) {
          matchesNeedingBackfill.push(match);
        }
      }
    }

    if (matchesNeedingBackfill.length === 0) {
      return { success: true, year, scrapedCount: 0, skippedCount: 0, backfilledCount: 0, warnings };
    }

    // Group by round for efficient fetching
    const roundSet = new Set(matchesNeedingBackfill.map(m => m.round));

    for (const round of roundSet) {
      const result = await this.teamListSource.fetchTeamLists(year, round);
      if (!result.success) {
        warnings.push({
          type: 'BACKFILL_FETCH_FAILED',
          message: `Failed to fetch team lists for backfill round ${round}: ${result.error}`,
          context: { year, round },
        });
        continue;
      }

      warnings.push(...result.warnings);

      const missingMatchIds = new Set(matchesNeedingBackfill.filter(m => m.round === round).map(m => m.id));

      for (const teamList of result.data) {
        if (!missingMatchIds.has(teamList.matchId)) {
          skippedCount++;
          continue;
        }
        await this.teamListRepository.save(teamList);
        backfilledCount++;
      }
    }

    logger.info('Team list backfill complete', {
      year,
      matchesNeedingBackfill: matchesNeedingBackfill.length,
      backfilledCount,
      skippedCount,
    });

    return { success: true, year, scrapedCount: 0, skippedCount, backfilledCount, warnings };
  }
}
