/**
 * Queue port — application-layer contract for scrape job dispatch.
 *
 * Use cases and discovery logic depend on this module only. Infrastructure
 * adapters (Cloudflare Queues, in-memory) live under src/infrastructure/queue/
 * and never appear in callers' import graph. See contracts/job-queue.md for
 * the authoritative pre/post-conditions.
 */

import { z } from 'zod';

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

export interface LockGameStrengthRatingsJob extends BaseJob {
  readonly type: 'lock-game-strength-ratings';
  readonly year: number;
  readonly round: number;
}

export type ScrapeJob =
  | ScrapeMatchResultsJob
  | ScrapePlayerStatsJob
  | ScrapeSupplementaryStatsJob
  | ScrapeTeamListsJob
  | ScrapeCasualtyWardJob
  | ComputePlayerMovementsJob
  | LockGameStrengthRatingsJob;

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

const LockGameStrengthRatingsJobSchema = z.object({
  type: z.literal('lock-game-strength-ratings'),
  version: z.literal(1),
  year: YearSchema,
  round: RoundSchema,
});

export const ScrapeJobSchema = z.discriminatedUnion('type', [
  ScrapeMatchResultsJobSchema,
  ScrapePlayerStatsJobSchema,
  ScrapeSupplementaryStatsJobSchema,
  ScrapeTeamListsJobSchema,
  ScrapeCasualtyWardJobSchema,
  ComputePlayerMovementsJobSchema,
  LockGameStrengthRatingsJobSchema,
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
