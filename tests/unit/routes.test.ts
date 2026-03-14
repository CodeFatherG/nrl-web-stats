import { describe, it, expect } from 'vitest';
import {
  parseUrl,
  buildHomeUrl,
  buildRoundUrl,
  buildTeamUrl,
  buildByeUrl,
  buildMatchUrl,
  isValidTeamCode,
  isValidRound,
} from '../../client/src/utils/routes';

describe('parseUrl', () => {
  it('parses root as home route', () => {
    expect(parseUrl('/')).toEqual({ type: 'home' });
  });

  it('parses /bye as bye route', () => {
    expect(parseUrl('/bye')).toEqual({ type: 'bye' });
  });

  it('parses /round/5 as round route', () => {
    expect(parseUrl('/round/5')).toEqual({ type: 'round', roundNumber: 5 });
  });

  it('parses /round/1 as round route (lower bound)', () => {
    expect(parseUrl('/round/1')).toEqual({ type: 'round', roundNumber: 1 });
  });

  it('parses /round/27 as round route (upper bound)', () => {
    expect(parseUrl('/round/27')).toEqual({ type: 'round', roundNumber: 27 });
  });

  it('returns notFound for /round/0 (below range)', () => {
    expect(parseUrl('/round/0')).toEqual({ type: 'notFound', path: '/round/0' });
  });

  it('returns notFound for /round/28 (above range)', () => {
    expect(parseUrl('/round/28')).toEqual({ type: 'notFound', path: '/round/28' });
  });

  it('returns notFound for /round/abc (non-numeric)', () => {
    expect(parseUrl('/round/abc')).toEqual({ type: 'notFound', path: '/round/abc' });
  });

  it('parses /team/BRO as team route', () => {
    expect(parseUrl('/team/BRO')).toEqual({ type: 'team', teamCode: 'BRO' });
  });

  it('parses /team/bro as team route (case insensitive)', () => {
    expect(parseUrl('/team/bro')).toEqual({ type: 'team', teamCode: 'BRO' });
  });

  it('parses /team/Mel as team route (mixed case)', () => {
    expect(parseUrl('/team/Mel')).toEqual({ type: 'team', teamCode: 'MEL' });
  });

  it('returns notFound for /team/XYZ (invalid code)', () => {
    expect(parseUrl('/team/XYZ')).toEqual({ type: 'notFound', path: '/team/XYZ' });
  });

  it('parses /match/12345 as match route', () => {
    expect(parseUrl('/match/12345')).toEqual({ type: 'match', matchId: '12345' });
  });

  it('parses /match/abc-def as match route', () => {
    expect(parseUrl('/match/abc-def')).toEqual({ type: 'match', matchId: 'abc-def' });
  });

  it('returns notFound for /foo/bar (unknown path)', () => {
    expect(parseUrl('/foo/bar')).toEqual({ type: 'notFound', path: '/foo/bar' });
  });

  it('returns notFound for /team (missing code)', () => {
    expect(parseUrl('/team')).toEqual({ type: 'notFound', path: '/team' });
  });

  it('returns notFound for /round (missing number)', () => {
    expect(parseUrl('/round')).toEqual({ type: 'notFound', path: '/round' });
  });

  it('handles trailing slashes', () => {
    expect(parseUrl('/bye/')).toEqual({ type: 'bye' });
    expect(parseUrl('/team/BRO/')).toEqual({ type: 'team', teamCode: 'BRO' });
  });

  it('parses all 17 valid team codes', () => {
    const codes = [
      'BRO', 'BUL', 'CBR', 'DOL', 'GCT', 'MEL', 'MNL',
      'NEW', 'NQC', 'NZL', 'PAR', 'PTH', 'SHA', 'STG',
      'STH', 'SYD', 'WST',
    ];
    for (const code of codes) {
      const result = parseUrl(`/team/${code}`);
      expect(result).toEqual({ type: 'team', teamCode: code });
    }
  });
});

describe('builder functions', () => {
  it('buildHomeUrl returns /', () => {
    expect(buildHomeUrl()).toBe('/');
  });

  it('buildRoundUrl returns /round/N', () => {
    expect(buildRoundUrl(5)).toBe('/round/5');
    expect(buildRoundUrl(27)).toBe('/round/27');
  });

  it('buildTeamUrl returns /team/CODE (uppercased)', () => {
    expect(buildTeamUrl('BRO')).toBe('/team/BRO');
    expect(buildTeamUrl('bro')).toBe('/team/BRO');
  });

  it('buildByeUrl returns /bye', () => {
    expect(buildByeUrl()).toBe('/bye');
  });

  it('buildMatchUrl returns /match/ID', () => {
    expect(buildMatchUrl('12345')).toBe('/match/12345');
  });
});

describe('isValidTeamCode', () => {
  it('accepts valid uppercase codes', () => {
    expect(isValidTeamCode('BRO')).toBe(true);
    expect(isValidTeamCode('MEL')).toBe(true);
  });

  it('accepts valid lowercase codes', () => {
    expect(isValidTeamCode('bro')).toBe(true);
  });

  it('rejects invalid codes', () => {
    expect(isValidTeamCode('XYZ')).toBe(false);
    expect(isValidTeamCode('')).toBe(false);
    expect(isValidTeamCode('BRONCOS')).toBe(false);
  });
});

describe('isValidRound', () => {
  it('accepts valid round numbers', () => {
    expect(isValidRound(1)).toBe(true);
    expect(isValidRound(14)).toBe(true);
    expect(isValidRound(27)).toBe(true);
  });

  it('rejects out-of-range numbers', () => {
    expect(isValidRound(0)).toBe(false);
    expect(isValidRound(28)).toBe(false);
    expect(isValidRound(-1)).toBe(false);
  });

  it('rejects non-integer numbers', () => {
    expect(isValidRound(1.5)).toBe(false);
    expect(isValidRound(NaN)).toBe(false);
  });
});
