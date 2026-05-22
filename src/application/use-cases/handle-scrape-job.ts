/**
 * HandleScrapeJobUseCase — execution half of the discovery/execution split.
 *
 * Consumes a JobBatch<ScrapeJob>, switches on job.type, delegates to the
 * appropriate Scrape*UseCase, and decides per-handle whether to ack, retry,
 * or surface a terminal failure (re-throw so the platform counts the attempt
 * → DLQ after max_retries).
 *
 * Per clarification (2026-05-20): the dispatcher MUST NOT publish follow-up
 * jobs. Chain effects (player-stats after match-results) are produced by the
 * next discovery tick re-evaluating D1 state.
 */

import type { JobBatch, JobHandle, ScrapeJob } from '../ports/job-queue.js';
import { ScrapeJobSchema } from '../ports/job-queue.js';
import { ProjectionStoreQuotaExhaustedError } from '../../domain/repositories/projection-repository.js';
import { PlayerMovementsStoreQuotaExhaustedError } from '../../domain/repositories/player-movements-repository.js';
import { ProvisionalGameStrengthStoreQuotaExhaustedError } from '../../domain/repositories/provisional-game-strength-repository.js';
import { GameStrengthStoreQuotaExhaustedError } from '../../domain/repositories/game-strength-repository.js';
import type { ScrapeMatchResultsUseCase } from './scrape-match-results.js';
import type { ScrapePlayerStatsUseCase } from './scrape-player-stats.js';
import type { ScrapeSupplementaryStatsUseCase } from './scrape-supplementary-stats.js';
import type { ScrapeTeamListsUseCase } from './scrape-team-lists.js';
import type { ScrapeCasualtyWardUseCase } from './scrape-casualty-ward.js';
import type { ComputePlayerMovementsUseCase } from './compute-player-movements.js';
import type { LockGameStrengthRatingsUseCase } from './lock-game-strength-ratings.js';
import type { PrecomputePlayerProjectionUseCase } from './precompute-player-projection.js';
import type { PrecomputeTeamRankingsUseCase } from './precompute-team-rankings.js';
import { queueLogger } from '../../utils/queue-logger.js';

/**
 * Adapters injected as use-case INSTANCES — the dispatcher does not know how
 * they were constructed (D1 binding, fakes for tests, etc.). Per-job construction
 * (some use cases are per-request because they hold D1 bindings) is the caller's
 * responsibility; the dispatcher accepts factories so it can build a fresh use
 * case per handle when the underlying resource is request-scoped.
 */
export interface HandleScrapeJobDeps {
  scrapeMatchResults: ScrapeMatchResultsUseCase;
  scrapePlayerStats: ScrapePlayerStatsUseCase;
  scrapeSupplementaryStats: ScrapeSupplementaryStatsUseCase;
  scrapeTeamLists: ScrapeTeamListsUseCase;
  scrapeCasualtyWard: ScrapeCasualtyWardUseCase;
  computePlayerMovements: ComputePlayerMovementsUseCase;
  lockGameStrength: LockGameStrengthRatingsUseCase;
  /** Spec 034: per-player leaf job dispatched by the fan-out discovery pass.
   *  Optional so test wiring without precompute doesn't have to construct it. */
  precomputePlayerProjection?: PrecomputePlayerProjectionUseCase;
  /** Spec 034: per (team, mode) leaf job. */
  precomputeTeamRankings?: PrecomputeTeamRankingsUseCase;
}

/** Classify thrown errors so the dispatcher can choose retry vs terminal. */
function classifyError(err: unknown): { kind: 'retry'; delaySeconds: number; reason: string } | { kind: 'terminal'; reason: string } {
  // Projection-store quota exhausted (spec 034, FR-021): retrying inside the
  // same UTC day cannot succeed; the watermark predicate re-fires on the next
  // discovery tick after the daily reset. Match by type, not by message.
  if (err instanceof ProjectionStoreQuotaExhaustedError) {
    return { kind: 'terminal', reason: 'projection-store-quota-exhausted' };
  }
  if (err instanceof PlayerMovementsStoreQuotaExhaustedError) {
    return { kind: 'terminal', reason: 'player-movements-store-quota-exhausted' };
  }
  if (err instanceof GameStrengthStoreQuotaExhaustedError) {
    return { kind: 'terminal', reason: 'game-strength-store-quota-exhausted' };
  }
  // Kept for defense-in-depth in case any code path raises the sub-adapter's
  // error directly without going through the composite's re-wrap.
  if (err instanceof ProvisionalGameStrengthStoreQuotaExhaustedError) {
    return { kind: 'terminal', reason: 'provisional-game-strength-store-quota-exhausted' };
  }

  const message = err instanceof Error ? err.message : String(err);

  // HTTP 5xx / network / Workers subrequest pressure — transient, retry with delay
  if (
    /HTTP 5\d\d/i.test(message) ||
    /fetch failed/i.test(message) ||
    /network/i.test(message) ||
    /subrequest/i.test(message) ||
    /timeout/i.test(message) ||
    /ECONNRESET/i.test(message)
  ) {
    return { kind: 'retry', delaySeconds: 120, reason: `transient: ${message}` };
  }

  // 4xx (excluding 429), schema/parse/validation failures — terminal
  if (/HTTP 4\d\d/i.test(message) && !/429/.test(message)) {
    return { kind: 'terminal', reason: `terminal: ${message}` };
  }
  if (/Validation failed/i.test(message) || /schema/i.test(message) || /parse/i.test(message)) {
    return { kind: 'terminal', reason: `terminal: ${message}` };
  }

  // 429 — backoff longer
  if (/429/.test(message)) {
    return { kind: 'retry', delaySeconds: 600, reason: `rate-limited: ${message}` };
  }

  // Default: retry without delay (let the platform's built-in backoff kick in)
  return { kind: 'retry', delaySeconds: 0, reason: `unclassified: ${message}` };
}

export class HandleScrapeJobUseCase {
  constructor(private readonly deps: HandleScrapeJobDeps) {}

  /** Run every handle in the batch. Each handle is settled (ack or retry) or
   * throws (terminal → platform attempt counter advances → DLQ at max_retries).
   */
  async handle(batch: JobBatch<ScrapeJob>): Promise<void> {
    for (const handle of batch.handles) {
      await this.handleOne(handle);
    }
  }

  /** Settle a single handle. Exposed for finer-grained dispatch (one handle per invocation). */
  async handleOne(handle: JobHandle<ScrapeJob>): Promise<void> {
    // Re-validate body at the dispatcher boundary as a defense-in-depth check.
    // Adapters MUST already have validated; failure here means the adapter is
    // broken or someone bypassed the port.
    const parsed = ScrapeJobSchema.safeParse(handle.body);
    if (!parsed.success) {
      queueLogger.jobDlq(
        handle.body,
        handle.attemptCount,
        `schema-validation-failed-in-dispatcher: ${parsed.error.issues[0].message}`
      );
      handle.ack(); // ack so it stops redelivering — adapter should have DLQed this already
      return;
    }
    const job = parsed.data as ScrapeJob;
    queueLogger.jobReceived(job, handle.attemptCount);

    const started = Date.now();
    try {
      await this.dispatch(job);
      const durationMs = Date.now() - started;
      handle.ack();
      queueLogger.jobAcked(job, handle.attemptCount, durationMs);
    } catch (err) {
      const classification = classifyError(err);
      if (classification.kind === 'retry') {
        handle.retry({ delaySeconds: classification.delaySeconds });
        queueLogger.jobRetry(job, handle.attemptCount, classification.reason, classification.delaySeconds);
        return;
      }
      // Terminal: re-throw so the platform's attempt counter advances.
      queueLogger.jobDlq(job, handle.attemptCount, classification.reason);
      throw err;
    }
  }

  private async dispatch(job: ScrapeJob): Promise<void> {
    switch (job.type) {
      case 'scrape-match-results':
        await this.deps.scrapeMatchResults.execute(job.year, job.round);
        return;
      case 'scrape-player-stats':
        await this.deps.scrapePlayerStats.execute(job.year, job.round, true);
        return;
      case 'scrape-supplementary-stats':
        await this.deps.scrapeSupplementaryStats.execute(job.year, job.round, job.force === true);
        return;
      case 'scrape-team-lists':
        await this.deps.scrapeTeamLists.execute(job.year, job.round);
        return;
      case 'scrape-casualty-ward':
        await this.deps.scrapeCasualtyWard.execute();
        return;
      case 'compute-player-movements':
        await this.deps.computePlayerMovements.execute(job.year, job.round);
        return;
      case 'recompute-game-strength':
        await this.deps.lockGameStrength.execute(job.year, job.completedRound);
        return;
      case 'precompute-player-projection':
        if (!this.deps.precomputePlayerProjection) {
          throw new Error('precompute-player-projection dispatched but no PrecomputePlayerProjectionUseCase wired');
        }
        await this.deps.precomputePlayerProjection.execute({
          year: job.year,
          asOfRound: job.asOfRound,
          playerId: job.playerId,
        });
        return;
      case 'precompute-team-rankings':
        if (!this.deps.precomputeTeamRankings) {
          throw new Error('precompute-team-rankings dispatched but no PrecomputeTeamRankingsUseCase wired');
        }
        await this.deps.precomputeTeamRankings.execute({
          year: job.year,
          asOfRound: job.asOfRound,
          teamCode: job.teamCode,
          mode: job.mode,
        });
        return;
      default: {
        // Exhaustiveness check — the discriminated union should make this unreachable.
        const _exhaustive: never = job;
        throw new Error(`Unhandled job type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
}
