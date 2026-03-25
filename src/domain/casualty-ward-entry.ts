/**
 * CasualtyWardEntry value object.
 * Represents a single injury stint for a player on the NRL casualty ward.
 */

/** A record of a single injury stint for a player */
export interface CasualtyWardEntry {
  readonly id: number | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly teamCode: string;
  readonly injury: string;
  readonly expectedReturn: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly playerId: string | null;
}

/** Validate a CasualtyWardEntry. Throws on invalid data. */
export function validateCasualtyWardEntry(entry: Omit<CasualtyWardEntry, 'id'>): void {
  if (!entry.firstName || entry.firstName.trim().length === 0) {
    throw new Error('First name must be non-empty');
  }
  if (!entry.lastName || entry.lastName.trim().length === 0) {
    throw new Error('Last name must be non-empty');
  }
  if (!entry.teamCode || entry.teamCode.trim().length === 0) {
    throw new Error('Team code must be non-empty');
  }
  if (!entry.injury || entry.injury.trim().length === 0) {
    throw new Error('Injury must be non-empty');
  }
  if (!entry.expectedReturn || entry.expectedReturn.trim().length === 0) {
    throw new Error('Expected return must be non-empty');
  }
  if (!entry.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(entry.startDate)) {
    throw new Error(`Start date must be ISO 8601 format (YYYY-MM-DD), got "${entry.startDate}"`);
  }
  if (entry.endDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.endDate)) {
    throw new Error(`End date must be ISO 8601 format (YYYY-MM-DD) or null, got "${entry.endDate}"`);
  }
  if (entry.endDate !== null && entry.endDate < entry.startDate) {
    throw new Error(`End date (${entry.endDate}) must be >= start date (${entry.startDate})`);
  }
}

/** Create a validated CasualtyWardEntry. Throws on invalid data. */
export function createCasualtyWardEntry(data: {
  id?: number | null;
  firstName: string;
  lastName: string;
  teamCode: string;
  injury: string;
  expectedReturn: string;
  startDate: string;
  endDate?: string | null;
  playerId?: string | null;
}): CasualtyWardEntry {
  const entry: CasualtyWardEntry = {
    id: data.id ?? null,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    teamCode: data.teamCode.trim(),
    injury: data.injury.trim(),
    expectedReturn: data.expectedReturn.trim(),
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    playerId: data.playerId ?? null,
  };

  validateCasualtyWardEntry(entry);
  return entry;
}

/** Get the full display name for a casualty ward entry */
export function getDisplayName(entry: CasualtyWardEntry): string {
  return `${entry.firstName} ${entry.lastName}`;
}

/** Check if a casualty ward entry is currently active (no end date) */
export function isActive(entry: CasualtyWardEntry): boolean {
  return entry.endDate === null;
}
