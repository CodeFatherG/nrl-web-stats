import { describe, it, expect } from 'vitest';
import {
  SC_POSITIONS,
  DUAL_SEPARATOR,
  isSupercoachPosition,
  parseSupercoachPosition,
  supercoachToCanonical,
  canonicalToSupercoach,
  formatSupercoachPositions,
} from '../../../src/domain/supercoach-positions.js';

describe('SC_POSITIONS', () => {
  it('contains the seven SC abbreviations', () => {
    expect([...SC_POSITIONS].sort()).toEqual(['2RF', '5/8', 'CTW', 'FLB', 'FRF', 'HFB', 'HOK']);
  });
});

describe('DUAL_SEPARATOR', () => {
  it('is a comma — must not be a slash because 5/8 contains a slash', () => {
    expect(DUAL_SEPARATOR).toBe(',');
  });
});

describe('isSupercoachPosition', () => {
  it.each(['FLB', 'FRF', '2RF', 'HOK', 'HFB', '5/8', 'CTW'])('accepts %s', (p) => {
    expect(isSupercoachPosition(p)).toBe(true);
  });
  it.each(['', 'WFB', 'HLF', 'INT', 'mid', 'flb'])('rejects %s', (p) => {
    expect(isSupercoachPosition(p)).toBe(false);
  });
});

describe('parseSupercoachPosition', () => {
  it('parses a single position', () => {
    expect(parseSupercoachPosition('HFB')).toEqual(['HFB']);
  });
  it('trims whitespace from the source string', () => {
    expect(parseSupercoachPosition(' HFB ')).toEqual(['HFB']);
  });
  it('preserves the slash inside 5/8 (does NOT split it)', () => {
    expect(parseSupercoachPosition('5/8')).toEqual(['5/8']);
  });
  it('splits dual positions on comma', () => {
    expect(parseSupercoachPosition('HFB,CTW')).toEqual(['HFB', 'CTW']);
  });
  it('preserves 5/8 alongside another dual', () => {
    expect(parseSupercoachPosition('5/8,HFB')).toEqual(['5/8', 'HFB']);
  });
  it('drops unknown tokens but keeps valid ones', () => {
    expect(parseSupercoachPosition('HFB,WFB,CTW')).toEqual(['HFB', 'CTW']);
  });
  it('deduplicates repeated tokens', () => {
    expect(parseSupercoachPosition('HFB,HFB')).toEqual(['HFB']);
  });
  it.each([null, undefined, '', '   '])('returns [] for empty input %s', (raw) => {
    expect(parseSupercoachPosition(raw)).toEqual([]);
  });
});

describe('supercoachToCanonical', () => {
  it('maps FLB to fullback', () => {
    expect(supercoachToCanonical('FLB')).toEqual(['fullback']);
  });
  it('maps CTW to centre and wing', () => {
    expect(supercoachToCanonical('CTW')).toEqual(['centre', 'wing']);
  });
  it('maps 2RF to second row and lock', () => {
    expect(supercoachToCanonical('2RF')).toEqual(['second row', 'lock']);
  });
  it('maps HFB to halfback only', () => {
    expect(supercoachToCanonical('HFB')).toEqual(['halfback']);
  });
  it('maps 5/8 to five-eighth', () => {
    expect(supercoachToCanonical('5/8')).toEqual(['five-eighth']);
  });
  it('returns [] for an unknown SC abbrev', () => {
    expect(supercoachToCanonical('WFB')).toEqual([]);
  });
});

describe('canonicalToSupercoach', () => {
  it.each([
    ['fullback', 'FLB'],
    ['centre', 'CTW'],
    ['wing', 'CTW'],
    ['winger', 'CTW'],         // alias via normalizePosition
    ['halfback', 'HFB'],
    ['five-eighth', '5/8'],
    ['hooker', 'HOK'],
    ['prop', 'FRF'],
    ['second row', '2RF'],
    ['2nd row', '2RF'],        // alias via normalizePosition
    ['lock', '2RF'],
  ])('maps %s to %s', (canonical, expected) => {
    expect(canonicalToSupercoach(canonical)).toBe(expected);
  });
  it('returns null for interchange', () => {
    expect(canonicalToSupercoach('interchange')).toBeNull();
  });
  it('returns null for unknown positions', () => {
    expect(canonicalToSupercoach('manager')).toBeNull();
  });
});

describe('formatSupercoachPositions', () => {
  it('joins single position', () => {
    expect(formatSupercoachPositions(['HFB'])).toBe('HFB');
  });
  it('joins dual positions with comma', () => {
    expect(formatSupercoachPositions(['HFB', 'CTW'])).toBe('HFB,CTW');
  });
  it('preserves the slash inside 5/8 when joined', () => {
    expect(formatSupercoachPositions(['5/8', 'HFB'])).toBe('5/8,HFB');
  });
  it('returns empty string for empty input', () => {
    expect(formatSupercoachPositions([])).toBe('');
  });
});

describe('round-trip', () => {
  it.each(SC_POSITIONS)('canonical → SC for canonical position covered by %s', (sc) => {
    for (const canonical of supercoachToCanonical(sc)) {
      expect(canonicalToSupercoach(canonical)).toBe(sc);
    }
  });
});
