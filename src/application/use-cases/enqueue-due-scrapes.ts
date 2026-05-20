/**
 * EnqueueDueScrapesUseCase — discovery half of the discovery/execution split.
 *
 * Replaces the inline scrape loops in the previous scheduled handler. Calls each
 * existing findRoundsNeeding* predicate to enumerate due work, then publishes
 * one ScrapeJob per unit through the JobProducer port.
 *
 * Per clarification (2026-05-20): discovery — not the dispatcher — owns
 * follow-up production. On any given cron tick we publish whatever the
 * predicates say is due *right now*. Chain effects (player-stats after
 * match-results) materialize on the next tick via the predicates re-evaluating
 * D1 state.
 *
 * Per FR-003a: every candidate (type, year, round) is gated on a cheap
 * source.isAvailable() probe; jobs are not published when the upstream
 * advertises no data. Probe failures are treated as "unavailable", not thrown.
 */

import type { JobProducer, ScrapeJob, ScrapeJobType } from '../ports/job-queue.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import type { MatchResultSource } from '../../domain/ports/match-result-source.js';
import type { PlayerStatsSource } from '../../domain/ports/player-stats-source.js';
import type { SupplementaryStatsSource } from '../../domain/ports/supplementary-stats-source.js';
import type { TeamListSource } from '../../domain/ports/team-list-source.js';
import type { CasualtyWardSource } from '../../domain/ports/casualty-ward-source.js';
import { MatchStatus } from '../../domain/match.js';
import {
  findRoundsNeedingScrape,
  findRoundsNeedingPlayerStats,
  findRoundsNeedingSupplementaryStats,
  findRoundsInPlayerStatsUpdateWindow,
} from './scrape-match-results.js';
import { queueLogger } from '../../utils/queue-logger.js';
import { logger } from '../../utils/logger.js';

/** Repository surface for D1-backed supplementary-stats queries that discovery needs. */
export interface SupplementaryStatsRepoLike {
  isRoundCached(season: number, round: number): Promise<boolean>;
  findRoundsWithNullPriceBreakEven(): Promise<Array<{ year: number; round: number }>>;
  findRoundsWithNullTeamCode(): Promise<Array<{ year: number; round: number }>>;
}

/** Repository surface for the GSR-lock predicate. */
export interface GameStrengthRepoLike {
  findByRound(year: number, round: number): Promise<unknown | null>;
}

export interface EnqueueDueScrapesDeps {
  matchRepository: MatchRepository;
  playerRepository: PlayerRepository;
  supplementaryRepo: SupplementaryStatsRepoLike;
  teamListRepository: TeamListRepository;
  gameStrengthRepo: GameStrengthRepoLike;
  matchResultSource: MatchResultSource;
  playerStatsSource: PlayerStatsSource;
  supplementaryStatsSource: SupplementaryStatsSource;
  teamListSource: TeamListSource;
  casualtyWardSource: CasualtyWardSource;
  producer: JobProducer;
}

export interface EnqueueDueScrapesInput {
  scheduledTime: Date;
  /** Year used for team-list / casualty-ward discovery decisions (defaults to scheduledTime.getFullYear()). */
  currentYear?: number;
  /**
   * When true, run the full discovery pass and emit the `discovery.published`
   * log but DO NOT actually call producer.publish. Used during shadow-mode
   * cutover to validate parity against the legacy inline loops.
   */
  shadowMode?: boolean;
}

export interface EnqueueDueScrapesSummary {
  jobCounts: Partial<Record<ScrapeJobType, number>>;
  totalPublished: number;
  totalSkipped: number;
  shadowMode: boolean;
}

export class EnqueueDueScrapesUseCase {
  constructor(private readonly deps: EnqueueDueScrapesDeps) {}

  async execute(input: EnqueueDueScrapesInput): Promise<EnqueueDueScrapesSummary> {
    const shadowMode = input.shadowMode === true;
    const scheduledTime = input.scheduledTime;
    const currentYear = input.currentYear ?? scheduledTime.getFullYear();

    const counts: Partial<Record<ScrapeJobType, number>> = {};
    let totalPublished = 0;
    let totalSkipped = 0;

    const tryPublish = async (
      job: ScrapeJob,
      isAvailable: () => Promise<boolean>
    ): Promise<void> => {
      let available = false;
      try {
        available = await isAvailable();
      } catch (err) {
        // Probe contract: implementations SHOULD swallow errors and return false.
        // A throw here is a bug in the adapter; treat as unavailable and log.
        logger.warn('isAvailable probe threw — treating job as unavailable', {
          jobType: job.type,
          payload: job,
          error: err instanceof Error ? err.message : 'unknown',
        });
        available = false;
      }
      if (!available) {
        totalSkipped += 1;
        return;
      }
      if (!shadowMode) {
        await this.deps.producer.publish(job);
      }
      counts[job.type] = (counts[job.type] ?? 0) + 1;
      totalPublished += 1;
    };

    // --------------------------------------------------------------------
    // 1. Match results — rounds with completed matches lacking persisted results
    // --------------------------------------------------------------------
    const roundsToScrape = await findRoundsNeedingScrape(this.deps.matchRepository, scheduledTime);
    const alreadyHandled = new Set<string>();

    for (const { year, round } of roundsToScrape) {
      alreadyHandled.add(`${year}-${round}`);
      await tryPublish(
        { type: 'scrape-match-results', version: 1, year, round },
        () => this.deps.matchResultSource.isAvailable(year, round)
      );
    }

    // --------------------------------------------------------------------
    // 2. Player stats — completed rounds with missing player stats
    //    (excluding rounds already covered by step 1: per-tick discovery
    //    rediscover means we don't double-publish for the same round.)
    // --------------------------------------------------------------------
    const playerStatsRounds = await findRoundsNeedingPlayerStats(
      this.deps.matchRepository,
      this.deps.playerRepository
    );
    const playerStatsOnly = playerStatsRounds.filter(
      r => !alreadyHandled.has(`${r.year}-${r.round}`)
    );

    for (const { year, round } of playerStatsOnly) {
      alreadyHandled.add(`${year}-${round}`);
      await tryPublish(
        { type: 'scrape-player-stats', version: 1, year, round },
        () => this.deps.playerStatsSource.isAvailable(year, round)
      );
    }

    // --------------------------------------------------------------------
    // 3. Supplementary stats — independent discovery (rounds with any completed
    //    match but no supp stats cached, excluding above)
    // --------------------------------------------------------------------
    const suppStatsRounds = await findRoundsNeedingSupplementaryStats(
      this.deps.matchRepository,
      this.deps.supplementaryRepo
    );
    const suppStatsOnly = suppStatsRounds.filter(
      r => !alreadyHandled.has(`${r.year}-${r.round}`)
    );

    for (const { year, round } of suppStatsOnly) {
      await tryPublish(
        { type: 'scrape-supplementary-stats', version: 1, year, round },
        () => this.deps.supplementaryStatsSource.isAvailable(year, round)
      );
    }

    // --------------------------------------------------------------------
    // 4. Player stats revision window — rounds whose stats are fully scraped
    //    but supp stats haven't landed; re-scrape (nrl.com revises until lock)
    // --------------------------------------------------------------------
    const updateWindowRounds = await findRoundsInPlayerStatsUpdateWindow(
      this.deps.matchRepository,
      this.deps.playerRepository,
      this.deps.supplementaryRepo
    );
    const updateWindowOnly = updateWindowRounds.filter(
      r => !alreadyHandled.has(`${r.year}-${r.round}`)
    );

    for (const { year, round } of updateWindowOnly) {
      await tryPublish(
        { type: 'scrape-player-stats', version: 1, year, round },
        () => this.deps.playerStatsSource.isAvailable(year, round)
      );
    }

    // --------------------------------------------------------------------
    // 5. Null-column backfills (price/break-even + team-code) — force a
    //    supp-stats re-scrape that overwrites null fields. The `force` flag on
    //    the job body tells the dispatcher to call execute(year, round, true).
    // --------------------------------------------------------------------
    const nullPriceBE = await this.deps.supplementaryRepo.findRoundsWithNullPriceBreakEven();
    const nullTeamCode = await this.deps.supplementaryRepo.findRoundsWithNullTeamCode();
    const backfillSet = new Set<string>();
    for (const r of [...nullPriceBE, ...nullTeamCode]) {
      backfillSet.add(`${r.year}-${r.round}`);
    }
    for (const key of backfillSet) {
      const [yearStr, roundStr] = key.split('-');
      const year = parseInt(yearStr, 10);
      const round = parseInt(roundStr, 10);
      await tryPublish(
        { type: 'scrape-supplementary-stats', version: 1, year, round, force: true },
        () => this.deps.supplementaryStatsSource.isAvailable(year, round)
      );
    }

    // --------------------------------------------------------------------
    // 6. Team lists — next upcoming round + window-triggered + completed backfill
    //    (collapsed into per-round dedup; idempotency on the use-case side
    //    avoids unnecessary upstream work even if we publish a round multiple
    //    times across ticks.)
    // --------------------------------------------------------------------
    const teamListRounds = await this.discoverTeamListRounds(currentYear, scheduledTime);
    for (const round of teamListRounds) {
      await tryPublish(
        { type: 'scrape-team-lists', version: 1, year: currentYear, round },
        () => this.deps.teamListSource.isAvailable(currentYear, round)
      );
    }

    // --------------------------------------------------------------------
    // 7. Player movements — re-derive after team lists for the next upcoming round
    // --------------------------------------------------------------------
    const nextUpcoming = await this.findNextUpcomingRound(currentYear);
    if (nextUpcoming !== null) {
      await tryPublish(
        { type: 'compute-player-movements', version: 1, year: currentYear, round: nextUpcoming },
        () => Promise.resolve(true) // pure computation against persisted data; always "available"
      );
    }

    // --------------------------------------------------------------------
    // 8. Casualty ward — runs every tick (current cron behavior preserved)
    // --------------------------------------------------------------------
    await tryPublish(
      { type: 'scrape-casualty-ward', version: 1, year: currentYear },
      () => this.deps.casualtyWardSource.isAvailable()
    );

    // --------------------------------------------------------------------
    // 9. GSR lock — completed rounds with cached supp stats whose next round
    //    has no locked GSR yet. The use case re-checks completeness internally
    //    (it no-ops on already-locked rounds) so over-publishing is harmless.
    // --------------------------------------------------------------------
    const gsrCandidates = await this.findGsrLockCandidates(currentYear);
    for (const round of gsrCandidates) {
      await tryPublish(
        { type: 'lock-game-strength-ratings', version: 1, year: currentYear, round },
        () => Promise.resolve(true) // pure D1 read + compute, always "available"
      );
    }

    const summary: EnqueueDueScrapesSummary = {
      jobCounts: counts,
      totalPublished,
      totalSkipped,
      shadowMode,
    };

    queueLogger.discoveryPublished({
      jobCounts: counts,
      totalPublished,
      totalSkipped,
      shadowMode,
    });

    return summary;
  }

  private async discoverTeamListRounds(year: number, currentTime: Date): Promise<number[]> {
    const matches = await this.deps.matchRepository.findByYear(year);
    if (matches.length === 0) return [];

    const rounds = new Set<number>();

    // (a) next upcoming round — any non-completed round, smallest first
    const upcoming = [...new Set(
      matches.filter(m => m.status !== MatchStatus.Completed).map(m => m.round)
    )].sort((a, b) => a - b);
    if (upcoming.length > 0) rounds.add(upcoming[0]);

    // (b) window-triggered: any non-completed match whose kick-off is within 24h
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const now = currentTime.getTime();
    for (const m of matches) {
      if (m.status === MatchStatus.Completed || !m.scheduledTime) continue;
      const kickOff = new Date(m.scheduledTime).getTime();
      if (Number.isNaN(kickOff)) continue;
      if (kickOff - now <= TWENTY_FOUR_HOURS && kickOff - now >= 0) {
        rounds.add(m.round);
      }
    }

    // (c) completed rounds missing team lists — backfill
    const completedRounds = [...new Set(
      matches.filter(m => m.status === MatchStatus.Completed).map(m => m.round)
    )];
    for (const round of completedRounds) {
      const matchesInRound = matches.filter(m => m.round === round && m.status === MatchStatus.Completed);
      let anyMissing = false;
      for (const m of matchesInRound) {
        if (!m.homeTeamCode || !m.awayTeamCode) continue;
        const homeExists = await this.deps.teamListRepository.hasTeamList(m.id, m.homeTeamCode);
        const awayExists = await this.deps.teamListRepository.hasTeamList(m.id, m.awayTeamCode);
        if (!homeExists || !awayExists) {
          anyMissing = true;
          break;
        }
      }
      if (anyMissing) rounds.add(round);
    }

    return [...rounds].sort((a, b) => a - b);
  }

  private async findNextUpcomingRound(year: number): Promise<number | null> {
    const matches = await this.deps.matchRepository.findByYear(year);
    const upcoming = [...new Set(
      matches.filter(m => m.status !== MatchStatus.Completed).map(m => m.round)
    )].sort((a, b) => a - b);
    return upcoming[0] ?? null;
  }

  private async findGsrLockCandidates(year: number): Promise<number[]> {
    const matches = await this.deps.matchRepository.findByYear(year);
    if (matches.length === 0) return [];

    const completedRounds = [...new Set(
      matches.filter(m => m.status === MatchStatus.Completed).map(m => m.round)
    )].sort((a, b) => a - b);

    const candidates: number[] = [];
    for (const round of completedRounds) {
      // Only worth a lock-gsr publish if supp stats are cached for this round
      // (the use case computes the NEXT round's GSR; supp stats for the just-
      // completed round are the input). Also skip if the next round is already
      // locked — the use case would no-op anyway, but we avoid the dispatch.
      const hasSupp = await this.deps.supplementaryRepo.isRoundCached(year, round);
      if (!hasSupp) continue;

      const existing = await this.deps.gameStrengthRepo.findByRound(year, round + 1);
      if (existing) continue;

      candidates.push(round);
    }
    return candidates;
  }
}
