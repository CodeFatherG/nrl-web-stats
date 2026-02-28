/**
 * DrawDataSource port interface.
 * Defines how schedule/draw data enters the domain from external sources.
 */

import type { Match } from '../match.js';
import type { Result } from '../result.js';

/** Port for fetching schedule/draw data */
export interface DrawDataSource {
  /** Fetch draw data for a season year. Returns Match aggregates with schedule fields populated. */
  fetchDraw(year: number): Promise<Result<Match[]>>;
}
