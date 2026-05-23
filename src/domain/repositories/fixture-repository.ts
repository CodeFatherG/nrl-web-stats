/**
 * FixtureRepository — canonical domain port for the per-year fixture artifact.
 *
 * One artifact per year. Identity: `year`. Carries the scraped payload plus a
 * `lastScrapedAt` freshness marker. Read-time projection (`findByYearAndTeam`)
 * filters the payload to one team.
 *
 * Adapters live under `src/infrastructure/persistence/` (KV in production,
 * in-memory for local/dev/tests). Use cases depend on this port only.
 *
 * Feature: 038-kv-fixture-repository.
 */

import type { Fixture } from '../../models/fixture.js';

/** Per-year aggregate. */
export interface FixtureArtifact {
  /** Identity. */
  readonly year: number;
  /** ISO 8601, UTC (suffix `Z`). Set by the writer at save time. */
  readonly computedAt: string;
  readonly freshness: {
    /** ISO 8601, UTC. When the scrape that produced the payload completed. */
    readonly lastScrapedAt: string;
  };
  /** The year's fixture rows (matches + inferred byes). */
  readonly payload: readonly Fixture[];
}

export interface FixtureRepository {
  /** Returns the artifact for `year`, or `null` when no artifact exists.
   *  Schema-version drift and decode failures also surface as `null`
   *  (treated as a miss; the next cron tick overwrites). */
  findByYear(year: number): Promise<FixtureArtifact | null>;

  /** Returns an artifact whose `payload` is filtered to `teamCode`.
   *  Returns `null` when the year-level artifact is absent. Returns an
   *  artifact with `payload: []` when the year is scraped but the team has
   *  zero fixtures. */
  findByYearAndTeam(
    year: number,
    teamCode: string,
  ): Promise<FixtureArtifact | null>;

  /** Map year → `lastScrapedAt` ISO string. Empty map (NOT null) when no
   *  artifacts exist. KV implementation reads metadata only — no value
   *  fetches. Iteration order is unspecified. */
  listScrapedYears(): Promise<Map<number, string>>;

  /** Persist `fixtures` as the year's artifact. Last-write-wins. Adapter
   *  stamps `computedAt = freshness.lastScrapedAt = new Date().toISOString()`. */
  save(year: number, fixtures: readonly Fixture[]): Promise<void>;
}

/** Thrown by `save` when the underlying KV store reports daily-write-quota
 *  exhaustion. The job dispatcher classifies this terminal so the failing
 *  job is not retried within the same UTC day. */
export class FixtureStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FixtureStoreQuotaExhaustedError';
  }
}
