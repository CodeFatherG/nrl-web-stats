/**
 * CasualtyWardSource port interface.
 * Defines how casualty ward data enters the domain from external sources.
 */

import type { Result } from '../result.js';

/** A single player entry from the casualty ward source */
export interface CasualtyWardPlayerData {
  readonly firstName: string;
  readonly lastName: string;
  readonly teamNickname: string;
  readonly injury: string;
  readonly expectedReturn: string;
  readonly profileUrl: string;
}

/** Port for fetching casualty ward data */
export interface CasualtyWardSource {
  /** Fetch all currently injured players from the casualty ward. */
  fetchCasualtyWard(): Promise<Result<CasualtyWardPlayerData[]>>;

  /**
   * Cheap upstream-availability probe — returns false if the casualty ward
   * endpoint is unreachable. Implementations MUST swallow exceptions and return
   * false rather than throwing.
   */
  isAvailable(): Promise<boolean>;
}
