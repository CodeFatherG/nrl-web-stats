/**
 * CasualtyWardRepository port interface.
 * Collection-like access to CasualtyWardEntry value objects.
 * All methods are async to support persistent storage (D1).
 */

import type { CasualtyWardEntry } from '../casualty-ward-entry.js';

/** Repository interface for CasualtyWardEntry persistence */
export interface CasualtyWardRepository {
  /** Insert a new casualty ward entry. Returns the inserted entry with generated id. */
  insert(entry: CasualtyWardEntry): Promise<CasualtyWardEntry>;

  /** Update an existing entry (injury, expectedReturn, endDate, playerId). */
  update(entry: CasualtyWardEntry): Promise<void>;

  /** Find all open entries (end_date IS NULL). */
  findOpen(): Promise<CasualtyWardEntry[]>;

  /** Find all entries (open and closed) for a given player ID. */
  findByPlayerId(playerId: string): Promise<CasualtyWardEntry[]>;

  /** Find all entries (open and closed), ordered by start_date DESC. */
  findAll(): Promise<CasualtyWardEntry[]>;

  /** Close an entry by setting its end date. */
  close(id: number, endDate: string): Promise<void>;

  /**
   * Find the most recent entry closed on `date` for a given player name + team.
   * Used to detect source flap: a player removed then re-added within the same day.
   */
  findRecentlyClosedByKey(
    firstName: string,
    lastName: string,
    teamCode: string,
    date: string
  ): Promise<CasualtyWardEntry | null>;

  /** Re-open a closed entry by clearing its end date. */
  reopen(id: number): Promise<void>;

  /** Returns all closed entries (endDate IS NOT NULL) with endDate >= sinceDate, ordered by endDate DESC. */
  findRecentlyClosed(sinceDate: string): Promise<CasualtyWardEntry[]>;
}
