import { normalizePosition } from './positions.js';
import { logger } from '../utils/logger.js';

export const SC_POSITIONS = ['FLB', 'FRF', '2RF', 'HOK', 'HFB', '5/8', 'CTW'] as const;
export type SupercoachPosition = (typeof SC_POSITIONS)[number];

const SC_POSITION_SET = new Set<string>(SC_POSITIONS);

// Dual-position separator. MUST NOT be '/' because the SC value '5/8' contains a slash.
export const DUAL_SEPARATOR = ',';

const SC_TO_CANONICAL: Record<SupercoachPosition, string[]> = {
  FLB: ['fullback'],
  CTW: ['centre', 'wing'],
  HFB: ['halfback'],
  '5/8': ['five-eighth'],
  HOK: ['hooker'],
  FRF: ['prop'],
  '2RF': ['second row', 'lock'],
};

const CANONICAL_TO_SC: Record<string, SupercoachPosition> = {
  fullback: 'FLB',
  centre: 'CTW',
  wing: 'CTW',
  halfback: 'HFB',
  'five-eighth': '5/8',
  hooker: 'HOK',
  prop: 'FRF',
  'second row': '2RF',
  lock: '2RF',
};

export function isSupercoachPosition(value: string): value is SupercoachPosition {
  return SC_POSITION_SET.has(value);
}

/**
 * Parse a raw SC position string from the source into a validated array of abbreviations.
 * Splits on comma only (never '/'). Drops unknown tokens with a warn log. Returns [] for empty input.
 */
export function parseSupercoachPosition(raw: string | null | undefined): SupercoachPosition[] {
  if (!raw) return [];
  const tokens = raw.split(DUAL_SEPARATOR).map(t => t.trim()).filter(t => t.length > 0);
  const out: SupercoachPosition[] = [];
  for (const tok of tokens) {
    if (isSupercoachPosition(tok)) {
      if (!out.includes(tok)) out.push(tok);
    } else {
      logger.warn('Unknown Supercoach position token', { token: tok, raw });
    }
  }
  return out;
}

/** Map a single SC abbreviation to the canonical NRL positions it covers. */
export function supercoachToCanonical(sc: string): string[] {
  return isSupercoachPosition(sc) ? [...SC_TO_CANONICAL[sc]] : [];
}

/** Map a canonical NRL position (with alias normalisation) to its SC abbreviation. */
export function canonicalToSupercoach(canonical: string): SupercoachPosition | null {
  const normalised = normalizePosition(canonical);
  return CANONICAL_TO_SC[normalised] ?? null;
}

/** Join SC positions into the canonical storage representation (comma-separated). */
export function formatSupercoachPositions(positions: SupercoachPosition[]): string {
  return positions.join(DUAL_SEPARATOR);
}
