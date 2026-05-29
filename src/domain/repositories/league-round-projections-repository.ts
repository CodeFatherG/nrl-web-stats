/**
 * LeagueRoundProjectionsRepository port — domain-layer interface for the
 * precomputed league-round dashboard artifact (top/bottom break-evens +
 * contextual top scorers + contextual top captains for one (year, round)).
 *
 * Follows the same envelope/coverage/quota pattern as the player-movements,
 * team-rankings, and team-strength-rankings artifacts.
 */

// ── Public payload rows ──────────────────────────────────────────────────────

export interface BreakEvenRow {
  readonly playerId: string | null;
  readonly playerName: string;
  readonly teamCode: string;
  readonly scPosition: string | null;
  readonly price: number;
  readonly breakEven: number;
}

export interface ProjectionRow {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly position: string;
  readonly opponent: string;
  readonly venue: string | null;
  readonly baseTotal: number;
  readonly adjustedTotal: number;
  readonly adjustedFloor: number;
  readonly adjustedCeiling: number;
  readonly rank: number;
}

export interface BreakEvenSlices {
  readonly top: BreakEvenRow[];
  readonly bottom: BreakEvenRow[];
}

// ── Stored artifact ──────────────────────────────────────────────────────────

export interface LeagueRoundProjectionsArtifact {
  readonly year: number;
  readonly round: number;
  /** Watermark the artifact was computed against. */
  readonly asOfRound: number;
  /** ISO 8601 timestamp — informational. */
  readonly computedAt: string;
  readonly breakEvens: BreakEvenSlices;
  readonly scorers: ProjectionRow[];
  readonly captains: ProjectionRow[];
}

// ── Quota-exhausted error ────────────────────────────────────────────────────

export class LeagueRoundProjectionsStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LeagueRoundProjectionsStoreQuotaExhaustedError';
  }
}

// ── Port ────────────────────────────────────────────────────────────────────

export interface LeagueRoundProjectionsRepository {
  /** Read the artifact for (year, round), or `null` on miss / schema drift. */
  findByYearAndRound(
    year: number,
    round: number,
  ): Promise<LeagueRoundProjectionsArtifact | null>;

  /** Coverage probe — round → asOfRound for every artifact stored under `year`.
   *  Listing-only; MUST NOT read artifact bodies. */
  listCoveredRounds(year: number): Promise<Map<number, number>>;

  /** Write an artifact, overwriting any existing artifact at the same
   *  (year, round). May throw `LeagueRoundProjectionsStoreQuotaExhaustedError`
   *  on quota exhaustion; transient backend errors propagate. */
  save(artifact: LeagueRoundProjectionsArtifact): Promise<void>;
}
