/**
 * GameStrengthRepository port — the single domain-layer abstraction over the
 * game-strength-rating store.
 *
 * Feature: 036-game-strength-artifact. See:
 *   specs/036-game-strength-artifact/contracts/game-strength-repository.md
 *
 * Vocabulary rule (FR-015): no "cache", "TTL", "namespace", "prefix",
 * "KV", "D1", "metadata", or any backend name appears here. Everything is
 * in domain terms — years, rounds, ratings, locked vs provisional state.
 *
 * The repository's implementation MAY be backed by multiple storage layers
 * (today: D1 for locked artifacts + KV for provisional artifacts), but
 * that split is an adapter concern. Callers see one port and never
 * orchestrate two backends themselves.
 */

import type { RoundGSR } from '../game-strength.js';

// ── Aggregate shape returned by read ────────────────────────────────────────

/**
 * The result of reading a game-strength rating for `(year, round)`. Carries
 * the rating payload (`gsr`) plus an explicit `locked` discriminator so
 * callers know whether they received the canonical, immutable rating or
 * a provisional value that may be overwritten on the next recompute cycle.
 *
 * For locked artifacts (FR-002): `locked = true`, `lockedAt` is the
 * ISO-8601 timestamp recording when the lock transition occurred.
 * For provisional artifacts: `locked = false`, `lockedAt = null`.
 */
export interface GameStrengthArtifact {
  readonly gsr: RoundGSR;
  readonly locked: boolean;
  readonly lockedAt: string | null;
}

// ── Error type (domain-named) ───────────────────────────────────────────────

/**
 * Thrown by a write that hits a store-side quota cap. Domain-named so the
 * contract names no infrastructure type;
 * `HandleScrapeJobUseCase.classifyError` matches by class identity and
 * classifies as terminal (FR-023 → DLQ, not retry).
 */
export class GameStrengthStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GameStrengthStoreQuotaExhaustedError';
  }
}

// ── Port ────────────────────────────────────────────────────────────────────

export interface GameStrengthRepository {
  /**
   * Read the rating for `(year, round)`. The repository consults the locked
   * store first; if a locked artifact exists it is returned (with
   * `locked = true`, `lockedAt` set). Otherwise the provisional store is
   * consulted; if a provisional artifact exists it is returned (with
   * `locked = false`, `lockedAt = null`). If neither layer has the artifact,
   * returns `null` — readers MUST NOT trigger a populating compute on the
   * request thread.
   *
   * The "locked-first then provisional" ordering is invariant — a locked
   * rating, once written, is the canonical answer and shadows any stale
   * provisional bytes that may not yet have been deleted.
   */
  read(year: number, round: number): Promise<GameStrengthArtifact | null>;

  /**
   * Write a locked artifact for `(year, round)`. Idempotent under conflict:
   * if a locked artifact already exists for the same identity, the write is
   * a benign no-op (existing immutability semantics preserved). Concurrent
   * recomputes are an expected race; this method MUST NOT throw on
   * conflict.
   *
   * Callers SHOULD also call `deleteProvisional(year, round)` after a
   * successful lock — the round's provisional entry is now superseded and
   * its bytes are pure overhead.
   */
  writeLocked(year: number, round: number, gsr: RoundGSR): Promise<void>;

  /**
   * Write a provisional artifact for `(year, round)`. Last-write-wins —
   * provisional ratings are by definition overwriteable. May throw
   * `GameStrengthStoreQuotaExhaustedError` on quota exhaustion at the
   * underlying store; transient backend errors propagate untouched.
   */
  writeProvisional(year: number, round: number, gsr: RoundGSR): Promise<void>;

  /**
   * Remove the provisional entry for `(year, round)` if one exists. Absent
   * entry is a no-op (does not throw). Failure of the underlying delete is
   * tolerated by the recompute job (the stale provisional is shadowed by
   * the locked artifact on the read path — see FR-012).
   */
  deleteProvisional(year: number, round: number): Promise<void>;

  /**
   * Remove every provisional entry for the given year. Used at the start
   * of a recompute cycle to clear stale entries before the rebuild loop
   * re-populates the year.
   */
  deleteAllProvisional(year: number): Promise<void>;

  /**
   * Return the set of rounds for which a LOCKED artifact exists in the
   * given year. Used by the cron-discovery predicate to compute the locked
   * half of the coverage gap-set.
   */
  listLockedRounds(year: number): Promise<ReadonlySet<number>>;

  /**
   * Return the set of rounds for which a PROVISIONAL artifact exists in
   * the given year. Used by the cron-discovery predicate to compute the
   * provisional half of the coverage gap-set. Implementations MUST
   * compute this without reading artifact bodies (listing-only).
   */
  listProvisionalRounds(year: number): Promise<ReadonlySet<number>>;
}
