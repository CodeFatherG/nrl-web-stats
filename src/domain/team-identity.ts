/**
 * TeamIdentity value object and static lookup registry.
 * Maps a single NRL team across multiple external source identifiers.
 */

/** TeamIdentity value object — immutable cross-source team mapping */
export interface TeamIdentity {
  /** Canonical 3-letter code (e.g., MNL) */
  readonly code: string;
  /** Full team name (e.g., Manly Sea Eagles) */
  readonly name: string;
  /** URL-friendly slug (e.g., sea-eagles) */
  readonly slug: string;
  /** Source-keyed numeric IDs (e.g., { "nrl.com": 500010 }) */
  readonly numericIds: Readonly<Record<string, number>>;
  /** Additional known names/abbreviations */
  readonly aliases: readonly string[];
}

/** Static registry data for all 17 NRL teams */
const TEAMS: readonly TeamIdentity[] = [
  { code: 'BRO', name: 'Brisbane Broncos', slug: 'broncos', numericIds: {}, aliases: [] },
  { code: 'BUL', name: 'Canterbury Bulldogs', slug: 'bulldogs', numericIds: {}, aliases: [] },
  { code: 'CBR', name: 'Canberra Raiders', slug: 'raiders', numericIds: {}, aliases: [] },
  { code: 'DOL', name: 'Dolphins', slug: 'dolphins', numericIds: {}, aliases: [] },
  { code: 'GCT', name: 'Gold Coast Titans', slug: 'titans', numericIds: {}, aliases: [] },
  { code: 'MEL', name: 'Melbourne Storm', slug: 'storm', numericIds: {}, aliases: [] },
  { code: 'MNL', name: 'Manly Sea Eagles', slug: 'sea-eagles', numericIds: {}, aliases: [] },
  { code: 'NEW', name: 'Newcastle Knights', slug: 'knights', numericIds: {}, aliases: [] },
  { code: 'NQC', name: 'North Queensland Cowboys', slug: 'cowboys', numericIds: {}, aliases: [] },
  { code: 'NZL', name: 'New Zealand Warriors', slug: 'warriors', numericIds: {}, aliases: [] },
  { code: 'PAR', name: 'Parramatta Eels', slug: 'eels', numericIds: {}, aliases: [] },
  { code: 'PTH', name: 'Penrith Panthers', slug: 'panthers', numericIds: {}, aliases: [] },
  { code: 'SHA', name: 'Cronulla Sharks', slug: 'sharks', numericIds: {}, aliases: [] },
  { code: 'STG', name: 'St George Illawarra Dragons', slug: 'dragons', numericIds: {}, aliases: [] },
  { code: 'STH', name: 'South Sydney Rabbitohs', slug: 'rabbitohs', numericIds: {}, aliases: [] },
  { code: 'SYD', name: 'Sydney Roosters', slug: 'roosters', numericIds: {}, aliases: [] },
  { code: 'WST', name: 'Wests Tigers', slug: 'tigers', numericIds: {}, aliases: [] },
];

/** Internal lookup map keyed by every known identifier (lowercased) */
const lookupMap = new Map<string, TeamIdentity>();

for (const team of TEAMS) {
  lookupMap.set(team.code.toLowerCase(), team);
  lookupMap.set(team.name.toLowerCase(), team);
  lookupMap.set(team.slug.toLowerCase(), team);
  for (const alias of team.aliases) {
    lookupMap.set(alias.toLowerCase(), team);
  }
}

/** Resolve any known identifier to its canonical TeamIdentity. Returns null if not found. */
export function resolveTeam(identifier: string): TeamIdentity | null {
  return lookupMap.get(identifier.toLowerCase()) ?? null;
}

/** Get all 17 NRL team identities */
export function getAllTeams(): readonly TeamIdentity[] {
  return TEAMS;
}
