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
import type { ProjectionRepository } from '../../domain/repositories/projection-repository.js';
import type { PlayerMovementsRepository } from '../../domain/repositories/player-movements-repository.js';
import type { GameStrengthRepository } from '../../domain/repositories/game-strength-repository.js';
import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import type { TeamFormRepository } from '../../domain/repositories/team-form-repository.js';
import type { MatchOutlookRepository } from '../../domain/repositories/match-outlook-repository.js';
import type { PlayerTrendsRepository } from '../../domain/repositories/player-trends-repository.js';
import type { CompositionImpactRepository } from '../../domain/repositories/composition-impact-repository.js';
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
import { ALL_RANKING_MODES } from '../../analytics/player-projection-types.js';
import { VALID_TEAM_CODES } from '../../models/team.js';

/** Repository surface for D1-backed supplementary-stats queries that discovery needs. */
export interface SupplementaryStatsRepoLike {
  isRoundCached(season: number, round: number): Promise<boolean>;
  findRoundsWithNullPriceBreakEven(): Promise<Array<{ year: number; round: number }>>;
  findRoundsWithNullTeamCode(): Promise<Array<{ year: number; round: number }>>;
}

export interface EnqueueDueScrapesDeps {
  matchRepository: MatchRepository;
  playerRepository: PlayerRepository;
  supplementaryRepo: SupplementaryStatsRepoLike;
  teamListRepository: TeamListRepository;
  /** Spec 036: unified GSR port — locked + provisional behind one interface. */
  gameStrengthRepository: GameStrengthRepository;
  matchResultSource: MatchResultSource;
  playerStatsSource: PlayerStatsSource;
  supplementaryStatsSource: SupplementaryStatsSource;
  teamListSource: TeamListSource;
  casualtyWardSource: CasualtyWardSource;
  producer: JobProducer;
  /** Spec 034 (FR-007): the projection store + a watermark function so the
   *  discovery use case can publish a PrecomputeProjections job when the
   *  watermark has advanced past the last successful precompute. */
  projectionRepository: ProjectionRepository;
  watermarkFn: (year: number) => Promise<number>;
  /** Spec 035 (FR-007): the player-movements artifact store, used to compute
   *  the gap-set between rounds with complete team lists and rounds with a
   *  movements artifact already written. */
  playerMovementsRepository: PlayerMovementsRepository;
  /** Spec 037: the four AnalyticsCache-replacing precomputed-artifact stores.
   *  Each is consulted by its own gap-set sweep against the current watermark. */
  teamFormRepository: TeamFormRepository;
  matchOutlookRepository: MatchOutlookRepository;
  playerTrendsRepository: PlayerTrendsRepository;
  compositionImpactRepository: CompositionImpactRepository;
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
    // 0. Draw scrape — fan out one `scrape-draw` job per active year so the
    //    Monday 6am UTC cron refreshes the durable fixture artifact via the
    //    queue rather than scraping inline. Active years = currentYear plus
    //    the prior year when scheduledTime precedes 1 April (preseason
    //    window where the previous season's data is still relevant).
    // --------------------------------------------------------------------
    const activeYears = new Set<number>([currentYear]);
    if (scheduledTime.getUTCMonth() < 3) {
      activeYears.add(currentYear - 1);
    }
    for (const drawYear of activeYears) {
      await tryPublish(
        { type: 'scrape-draw', version: 1, year: drawYear },
        () => Promise.resolve(true),
      );
    }

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
    // 7. Player movements — enqueue a precompute for every round with
    //    complete team lists that does not yet have a stored artifact
    //    (spec 035 FR-007). Gap-set discovery; idempotent under last-write-wins.
    // --------------------------------------------------------------------
    const completedTeamListRounds =
      await this.deps.teamListRepository.findRoundsWithCompleteTeamLists(currentYear);
    const coveredMovementsRounds =
      await this.deps.playerMovementsRepository.listCoveredRounds(currentYear);
    for (const round of [...completedTeamListRounds].sort((a, b) => a - b)) {
      if (coveredMovementsRounds.has(round)) continue;
      await tryPublish(
        { type: 'compute-player-movements', version: 1, year: currentYear, round },
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
    // Spec 036 (T029): publish ONE recompute-game-strength job per year per
    // tick when a GSR coverage gap exists. The batched compute path inside
    // LockGameStrengthRatingsUseCase fills the entire gap in one invocation
    // (heap-pressure mitigation per spec FR-011, SC-008 — sequential
    // per-team history fetches, no per-round fan-out).
    const gsrCompletedRound = await this.findHighestCompletedSuppStatsRound(currentYear);
    if (gsrCompletedRound !== null && await this.hasGsrCoverageGap(currentYear)) {
      await tryPublish(
        { type: 'recompute-game-strength', version: 1, year: currentYear, completedRound: gsrCompletedRound },
        () => Promise.resolve(true) // pure D1 + KV read + compute, always "available"
      );
    }

    // --------------------------------------------------------------------
    // 10. Precompute projections — fan-out per (player) and per (team, mode).
    //     Predicate-based completion: status advances on the tick that
    //     observes full coverage at the watermark. Sub-jobs are idempotent
    //     against the same asOfRound, so re-emission on partial failure
    //     simply re-runs the missing ones (spec 034, FR-003 / FR-007).
    // --------------------------------------------------------------------
    const watermark = await this.deps.watermarkFn(currentYear);
    if (watermark > 0) {
      const status = await this.deps.projectionRepository.findPrecomputeStatus(currentYear);
      if (status === null || watermark > status.asOfRound) {
        // Cheap coverage probe — one KV `list` call per category, NOT per player.
        const [playerCoverage, teamCoverage] = await Promise.all([
          this.deps.projectionRepository.listPlayerAggregateAsOfRounds(currentYear),
          this.deps.projectionRepository.listTeamRankingsAsOfRounds(currentYear),
        ]);

        // Expected player set = anyone with a season summary in this year.
        const expectedPlayers = await this.deps.playerRepository.findAllSeasonSummaries(currentYear);
        const seenPlayerIds = new Set<string>();
        let missingPlayers = 0;
        for (const summary of expectedPlayers) {
          if (seenPlayerIds.has(summary.playerId)) continue;
          seenPlayerIds.add(summary.playerId);
          const coveredAt = playerCoverage.get(summary.playerId) ?? -1;
          if (coveredAt >= watermark) continue;
          missingPlayers += 1;
          await tryPublish(
            {
              type: 'precompute-player-projection',
              version: 1,
              year: currentYear,
              asOfRound: watermark,
              playerId: summary.playerId,
            },
            () => Promise.resolve(true)
          );
        }

        // Expected team-mode set = 17 teams × 4 modes.
        let missingTeamModes = 0;
        for (const teamCode of VALID_TEAM_CODES) {
          for (const mode of ALL_RANKING_MODES) {
            const coveredAt = teamCoverage.get(`${teamCode}:${mode}`) ?? -1;
            if (coveredAt >= watermark) continue;
            missingTeamModes += 1;
            await tryPublish(
              {
                type: 'precompute-team-rankings',
                version: 1,
                year: currentYear,
                asOfRound: watermark,
                teamCode,
                mode,
              },
              () => Promise.resolve(true)
            );
          }
        }

        // Predicate: full coverage at the watermark → advance status now.
        // The status write happens here, NOT inside any leaf job — only
        // discovery has the global view to know everything is current.
        // Suppressed under shadowMode (dry-run must have no side effects).
        if (missingPlayers === 0 && missingTeamModes === 0 && !shadowMode) {
          await this.deps.projectionRepository.savePrecomputeStatus({
            year: currentYear,
            asOfRound: watermark,
          });
          logger.info('precompute.status.advanced', { year: currentYear, asOfRound: watermark });
        }
      }
    }

    // --------------------------------------------------------------------
    // 11. Spec 037 — Four AnalyticsCache-replacing artifacts. Per-tick
    //     gap-set fan-out scoped to the current year only. Each artifact
    //     family does one kv.list (metadata-only) to read coverage, then
    //     publishes one leaf job per identity whose stored asOfRound is
    //     below the current watermark.
    //
    //     Scoping rule (spec FR-009): current year only. Past-year identities
    //     are not refreshed; if their artifacts are missing the read path
    //     emits `{ available: false }` and an on-demand backfill is out of
    //     scope for this feature.
    // --------------------------------------------------------------------
    if (watermark > 0) {
      const yearMatches = await this.deps.matchRepository.findByYear(currentYear);
      const teamCodes = new Set<string>();
      const rounds = new Set<number>();
      for (const m of yearMatches) {
        if (m.homeTeamCode) teamCodes.add(m.homeTeamCode);
        if (m.awayTeamCode) teamCodes.add(m.awayTeamCode);
        if (m.round <= watermark) rounds.add(m.round);
      }

      // 11a. team-form — one leaf per (year, teamCode)
      const teamFormCoverage = await this.deps.teamFormRepository.listTeamFormAsOfRounds(currentYear);
      for (const teamCode of teamCodes) {
        const coveredAt = teamFormCoverage.get(teamCode) ?? -1;
        if (coveredAt >= watermark) continue;
        await tryPublish(
          { type: 'precompute-team-form', version: 1, year: currentYear, asOfRound: watermark, teamCode },
          () => Promise.resolve(true),
        );
      }

      // 11b. match-outlook — one leaf per (year, round) where round ≤ watermark
      const matchOutlookCoverage = await this.deps.matchOutlookRepository.listMatchOutlookAsOfRounds(currentYear);
      for (const round of rounds) {
        const coveredAt = matchOutlookCoverage.get(round) ?? -1;
        if (coveredAt >= watermark) continue;
        await tryPublish(
          { type: 'precompute-match-outlook', version: 1, year: currentYear, asOfRound: watermark, round },
          () => Promise.resolve(true),
        );
      }

      // 11c. player-trends — one leaf per (year, teamCode)
      const playerTrendsCoverage = await this.deps.playerTrendsRepository.listPlayerTrendsAsOfRounds(currentYear);
      for (const teamCode of teamCodes) {
        const coveredAt = playerTrendsCoverage.get(teamCode) ?? -1;
        if (coveredAt >= watermark) continue;
        await tryPublish(
          { type: 'precompute-player-trends', version: 1, year: currentYear, asOfRound: watermark, teamCode },
          () => Promise.resolve(true),
        );
      }

      // 11d. composition-impact — one leaf per (year, teamCode)
      const compositionImpactCoverage = await this.deps.compositionImpactRepository.listCompositionImpactAsOfRounds(currentYear);
      for (const teamCode of teamCodes) {
        const coveredAt = compositionImpactCoverage.get(teamCode) ?? -1;
        if (coveredAt >= watermark) continue;
        await tryPublish(
          { type: 'precompute-composition-impact', version: 1, year: currentYear, asOfRound: watermark, teamCode },
          () => Promise.resolve(true),
        );
      }
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

  /**
   * Spec 036 (FR-013): return the highest round for which supplementary
   * stats are cached. This is the `completedRound` input to the recompute
   * job — the lock use case derives `nextRound = completedRound + 1` and
   * computes provisional ratings for everything beyond.
   *
   * Returns `null` if no completed match round has supp stats cached yet
   * (nothing to recompute from).
   */
  private async findHighestCompletedSuppStatsRound(year: number): Promise<number | null> {
    const matches = await this.deps.matchRepository.findByYear(year);
    if (matches.length === 0) return null;
    const completedRounds = [...new Set(
      matches.filter(m => m.status === MatchStatus.Completed).map(m => m.round)
    )].sort((a, b) => b - a); // descending
    for (const round of completedRounds) {
      const hasSupp = await this.deps.supplementaryRepo.isRoundCached(year, round);
      if (hasSupp) return round;
    }
    return null;
  }

  /**
   * Spec 036 (FR-013): a GSR coverage gap exists when the set of rounds
   * with EITHER a locked D1 row OR a provisional KV entry is strictly
   * smaller than the set of rounds the season expects (per match data).
   */
  private async hasGsrCoverageGap(year: number): Promise<boolean> {
    const matches = await this.deps.matchRepository.findByYear(year);
    if (matches.length === 0) return false;
    const allRounds = new Set(matches.map(m => m.round));
    const locked = await this.deps.gameStrengthRepository.listLockedRounds(year);
    const provisional = await this.deps.gameStrengthRepository.listProvisionalRounds(year);
    for (const round of allRounds) {
      if (!locked.has(round) && !provisional.has(round)) return true;
    }
    return false;
  }
}
