/**
 * Client-side route definitions, URL parser, URL builder, and validation.
 * Uses browser History API — no external routing library.
 */

/** Valid 3-letter team codes (canonical, uppercased) */
const VALID_TEAM_CODES = new Set([
  'BRO', 'BUL', 'CBR', 'DOL', 'GCT', 'MEL', 'MNL',
  'NEW', 'NQC', 'NZL', 'PAR', 'PTH', 'SHA', 'STG',
  'STH', 'SYD', 'WST',
]);

/** Discriminated union for all possible route matches */
export type RouteMatch =
  | { type: 'home' }
  | { type: 'round'; roundNumber: number }
  | { type: 'team'; teamCode: string }
  | { type: 'bye' }
  | { type: 'match'; matchId: string }
  | { type: 'supercoach' }
  | { type: 'supercoachRound'; roundNumber: number }
  | { type: 'players' }
  | { type: 'player'; playerId: string }
  | { type: 'casualtyWard' }
  | { type: 'compare'; playerIds: string[] }
  | { type: 'notFound'; path: string };

/** Check if a team code is valid (case-insensitive) */
export function isValidTeamCode(code: string): boolean {
  return VALID_TEAM_CODES.has(code.toUpperCase());
}

/** Check if a round number is valid (integer 1–27) */
export function isValidRound(num: number): boolean {
  return Number.isInteger(num) && num >= 1 && num <= 27;
}

/** Get all valid team codes (for error messages) */
export function getValidTeamCodes(): string[] {
  return Array.from(VALID_TEAM_CODES).sort();
}

/**
 * Parse a URL (pathname or pathname+search) into a RouteMatch.
 * Returns the matched route with extracted and validated params.
 *
 * The compare route uses a query parameter to avoid comma encoding issues:
 *   /compare?ids=id1,id2,id3
 * All other routes use path segments only.
 */
export function parseUrl(url: string): RouteMatch {
  // Split pathname from query string
  const qIndex = url.indexOf('?');
  const pathname = qIndex === -1 ? url : url.slice(0, qIndex);
  const search = qIndex === -1 ? '' : url.slice(qIndex);

  // Normalise: strip trailing slash (except root)
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);

  // Root: /
  if (segments.length === 0) {
    return { type: 'home' };
  }

  // /bye
  if (segments.length === 1 && segments[0] === 'bye') {
    return { type: 'bye' };
  }

  // /round/:num
  if (segments.length === 2 && segments[0] === 'round') {
    const num = Number(segments[1]);
    if (isValidRound(num)) {
      return { type: 'round', roundNumber: num };
    }
    return { type: 'notFound', path };
  }

  // /team/:code
  if (segments.length === 2 && segments[0] === 'team') {
    const code = segments[1]!.toUpperCase();
    if (isValidTeamCode(code)) {
      return { type: 'team', teamCode: code };
    }
    return { type: 'notFound', path };
  }

  // /supercoach
  if (segments.length === 1 && segments[0] === 'supercoach') {
    return { type: 'supercoach' };
  }

  // /supercoach/:round
  if (segments.length === 2 && segments[0] === 'supercoach') {
    const num = Number(segments[1]);
    if (isValidRound(num)) {
      return { type: 'supercoachRound', roundNumber: num };
    }
    return { type: 'notFound', path };
  }

  // /match/:id
  if (segments.length === 2 && segments[0] === 'match') {
    const id = segments[1]!;
    if (id.length > 0) {
      return { type: 'match', matchId: id };
    }
    return { type: 'notFound', path };
  }

  // /casualty-ward
  if (segments.length === 1 && segments[0] === 'casualty-ward') {
    return { type: 'casualtyWard' };
  }

  // /players
  if (segments.length === 1 && segments[0] === 'players') {
    return { type: 'players' };
  }

  // /player/:playerId
  if (segments.length === 2 && segments[0] === 'player') {
    const playerId = segments[1]!;
    if (playerId.length > 0) {
      return { type: 'player', playerId };
    }
    return { type: 'notFound', path };
  }

  // /compare?id=id1&id=id2  (repeated params — no separator character needed)
  if (segments.length === 1 && segments[0] === 'compare') {
    const params = new URLSearchParams(search);
    const playerIds = params.getAll('id').filter((id) => id.length > 0);
    return { type: 'compare', playerIds };
  }

  return { type: 'notFound', path };
}

/** Build URL for home (season overview) */
export function buildHomeUrl(): string {
  return '/';
}

/** Build URL for a specific round */
export function buildRoundUrl(roundNumber: number): string {
  return `/round/${roundNumber}`;
}

/** Build URL for a team schedule */
export function buildTeamUrl(teamCode: string): string {
  return `/team/${teamCode.toUpperCase()}`;
}

/** Build URL for bye overview */
export function buildByeUrl(): string {
  return '/bye';
}

/** Build URL for match detail */
export function buildMatchUrl(matchId: string): string {
  return `/match/${matchId}`;
}

/** Build URL for supercoach overview */
export function buildSupercoachUrl(): string {
  return '/supercoach';
}

/** Build URL for a specific supercoach round */
export function buildSupercoachRoundUrl(roundNumber: number): string {
  return `/supercoach/${roundNumber}`;
}

/** Build URL for casualty ward */
export function buildCasualtyWardUrl(): string {
  return '/casualty-ward';
}

/** Build URL for players summary */
export function buildPlayersUrl(): string {
  return '/players';
}

/** Build URL for a specific player detail */
export function buildPlayerUrl(playerId: string): string {
  return `/player/${playerId}`;
}

/** Build URL for the player comparison page */
export function buildCompareUrl(playerIds: string[]): string {
  if (playerIds.length === 0) return '/compare';
  const params = new URLSearchParams(playerIds.map((id) => ['id', id]));
  return `/compare?${params.toString()}`;
}
