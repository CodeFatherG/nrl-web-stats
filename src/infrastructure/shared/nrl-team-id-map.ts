/**
 * Shared nrl.com teamId → canonical 3-letter code mapping.
 * Used by both NrlComMatchResultAdapter and NrlComPlayerStatsAdapter.
 */

/** nrl.com teamId → canonical 3-letter code */
export const TEAM_ID_MAP = new Map<number, string>([
  [500011, 'BRO'],
  [500010, 'BUL'],
  [500013, 'CBR'],
  [500723, 'DOL'],
  [500004, 'GCT'],
  [500021, 'MEL'],
  [500002, 'MNL'],
  [500003, 'NEW'],
  [500012, 'NQC'],
  [500032, 'NZL'],
  [500031, 'PAR'],
  [500014, 'PTH'],
  [500028, 'SHA'],
  [500022, 'STG'],
  [500005, 'STH'],
  [500001, 'SYD'],
  [500023, 'WST'],
]);

/** Resolve an nrl.com teamId to the canonical 3-letter code */
export function resolveNrlComTeamId(teamId: number): string | null {
  return TEAM_ID_MAP.get(teamId) ?? null;
}
