/**
 * Queue port — application-layer contract for scrape job dispatch.
 *
 * Use cases and discovery logic depend on this module only. Infrastructure
 * adapters (Cloudflare Queues, in-memory) live under src/infrastructure/queue/
 * and never appear in callers' import graph. See contracts/job-queue.md for
 * the authoritative pre/post-conditions.
 */

import { z } from 'zod';
import type { RankingMode } from '../../analytics/player-projection-types.js';

// ---------------------------------------------------------------------------
// ScrapeJob — discriminated union of every unit of scrape work
// ---------------------------------------------------------------------------

/** Common base — every variant carries a schema version to guard deserialization. */
interface BaseJob {
  readonly version: 1;
}

export interface ScrapeMatchResultsJob extends BaseJob {
  readonly type: 'scrape-match-results';
  readonly year: number;
  readonly round: number;
}

export interface ScrapePlayerStatsJob extends BaseJob {
  readonly type: 'scrape-player-stats';
  readonly year: number;
  readonly round: number;
}

export interface ScrapeSupplementaryStatsJob extends BaseJob {
  readonly type: 'scrape-supplementary-stats';
  readonly year: number;
  readonly round: number;
  /** Force re-scrape even when round is already cached (used for null-column backfills). */
  readonly force?: boolean;
}

export interface ScrapeTeamListsJob extends BaseJob {
  readonly type: 'scrape-team-lists';
  readonly year: number;
  readonly round: number;
}

export interface ScrapeCasualtyWardJob extends BaseJob {
  readonly type: 'scrape-casualty-ward';
  readonly year: number;
}

export interface ComputePlayerMovementsJob extends BaseJob {
  readonly type: 'compute-player-movements';
  readonly year: number;
  readonly round: number;
}

/** Recompute the GSR for one year. Locks `completedRound + 1` to D1 (existing
 *  immutability semantics preserved) and rebuilds the provisional KV entries
 *  for `completedRound + 2 ... season-end` in one batched invocation.
 *  Renamed from `lock-game-strength-ratings` by spec 036. */
export interface RecomputeGameStrengthJob extends BaseJob {
  readonly type: 'recompute-game-strength';
  readonly year: number;
  /** The round whose supplementary stats just completed (the lock-precondition
   *  round). Use case derives `nextRound = completedRound + 1` etc. */
  readonly completedRound: number;
}

/** Precompute one (player, year) projection aggregate against a specific
 *  watermark. Published by EnqueueDueScrapesUseCase for every player whose
 *  aggregate is missing or stale relative to the current watermark. */
export interface PrecomputePlayerProjectionJob extends BaseJob {
  readonly type: 'precompute-player-projection';
  readonly year: number;
  /** Watermark observed at discovery time; consumer writes the aggregate with
   *  this as `asOfRound` so the read-path freshness check matches exactly. */
  readonly asOfRound: number;
  readonly playerId: string;
}

/** Precompute one (year, teamCode, mode) team-rankings aggregate against a
 *  specific watermark. 17 teams × 4 modes = 68 sub-jobs per full run. */
export interface PrecomputeTeamRankingsJob extends BaseJob {
  readonly type: 'precompute-team-rankings';
  readonly year: number;
  readonly asOfRound: number;
  readonly teamCode: string;
  readonly mode: RankingMode;
}

export type ScrapeJob =
  | ScrapeMatchResultsJob
  | ScrapePlayerStatsJob
  | ScrapeSupplementaryStatsJob
  | ScrapeTeamListsJob
  | ScrapeCasualtyWardJob
  | ComputePlayerMovementsJob
  | RecomputeGameStrengthJob
  | PrecomputePlayerProjectionJob
  | PrecomputeTeamRankingsJob;

export type ScrapeJobType = ScrapeJob['type'];

// ---------------------------------------------------------------------------
// Zod schemas — validate untrusted inbound messages at the queue boundary
// ---------------------------------------------------------------------------

const YearSchema = z.number().int().min(2000);
const RoundSchema = z.number().int().min(1);

const ScrapeMatchResultsJobSchema = z.object({
  type: z.literal('scrape-match-results'),
  version: z.literal(1),
  year: YearSchema,
  round: RoundSchema,
});

const ScrapePlayerStatsJobSchema = z.object({
  type: z.literal('scrape-player-stats'),
  version: z.literal(1),
  year: YearSchema,
  round: RoundSchema,
});

const ScrapeSupplementaryStatsJobSchema = z.object({
  type: z.literal('scrape-supplementary-stats'),
  version: z.literal(1),
  year: YearSchema,
  round: RoundSchema,
  force: z.boolean().optional(),
});

const ScrapeTeamListsJobSchema = z.object({
  type: z.literal('scrape-team-lists'),
  version: z.literal(1),
  year: YearSchema,
  round: RoundSchema,
});

const ScrapeCasualtyWardJobSchema = z.object({
  type: z.literal('scrape-casualty-ward'),
  version: z.literal(1),
  year: YearSchema,
});

const ComputePlayerMovementsJobSchema = z.object({
  type: z.literal('compute-player-movements'),
  version: z.literal(1),
  year: YearSchema,
  round: RoundSchema,
});

const RecomputeGameStrengthJobSchema = z.object({
  type: z.literal('recompute-game-strength'),
  version: z.literal(1),
  year: YearSchema,
  completedRound: z.number().int().nonnegative(),
});

const RankingModeSchema = z.enum(['composite', 'captaincy', 'selection', 'trade']);

const PrecomputePlayerProjectionJobSchema = z.object({
  type: z.literal('precompute-player-projection'),
  version: z.literal(1),
  year: YearSchema,
  asOfRound: z.number().int().nonnegative(),
  playerId: z.string().min(1),
});

const PrecomputeTeamRankingsJobSchema = z.object({
  type: z.literal('precompute-team-rankings'),
  version: z.literal(1),
  year: YearSchema,
  asOfRound: z.number().int().nonnegative(),
  teamCode: z.string().min(1),
  mode: RankingModeSchema,
});

export const ScrapeJobSchema = z.discriminatedUnion('type', [
  ScrapeMatchResultsJobSchema,
  ScrapePlayerStatsJobSchema,
  ScrapeSupplementaryStatsJobSchema,
  ScrapeTeamListsJobSchema,
  ScrapeCasualtyWardJobSchema,
  ComputePlayerMovementsJobSchema,
  RecomputeGameStrengthJobSchema,
  PrecomputePlayerProjectionJobSchema,
  PrecomputeTeamRankingsJobSchema,
]);

// ---------------------------------------------------------------------------
// Port: producer side
// ---------------------------------------------------------------------------

export interface JobProducer {
  /** Publish a single job. Throws on schema-validation failure or platform rejection. */
  publish(job: ScrapeJob): Promise<void>;
  /** Publish a batch. Not required to be atomic — consumers must be idempotent. */
  publishBatch(jobs: readonly ScrapeJob[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Port: consumer side
// ---------------------------------------------------------------------------

export interface JobHandle<T> {
  readonly body: T;
  /** 1 on first delivery; increments on each redelivery (sourced from the platform, never synthesised). */
  readonly attemptCount: number;
  /** Mark the job complete. After ack, no further delivery occurs. */
  ack(): void;
  /** Return the job to the queue for redelivery. delaySeconds is clamped by the adapter. */
  retry(opts?: { delaySeconds?: number }): void;
}

export interface JobBatch<T> {
  readonly handles: readonly JobHandle<T>[];
  ackAll(): void;
  retryAll(opts?: { delaySeconds?: number }): void;
}

// ---------------------------------------------------------------------------
// Dispatcher-internal helper — captures the result of one delegation
// ---------------------------------------------------------------------------

export type JobOutcome =
  | { kind: 'success' }
  | { kind: 'retry'; reason: string; delaySeconds?: number }
  | { kind: 'terminal'; reason: string };
