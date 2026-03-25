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
}
