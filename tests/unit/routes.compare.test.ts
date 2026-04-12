import { describe, it, expect } from 'vitest';
import { parseUrl, buildCompareUrl } from '../../client/src/utils/routes';

describe('compare route parsing', () => {
  it('parses /compare with no IDs to empty playerIds', () => {
    const result = parseUrl('/compare');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });

  it('parses /compare/ (trailing slash) to empty playerIds', () => {
    const result = parseUrl('/compare/');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });

  it('parses /compare/abc to a single player ID', () => {
    const result = parseUrl('/compare/abc');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc'] });
  });

  it('parses /compare/abc,def to two player IDs', () => {
    const result = parseUrl('/compare/abc,def');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'def'] });
  });

  it('parses /compare/abc,def,ghi to three player IDs', () => {
    const result = parseUrl('/compare/abc,def,ghi');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'def', 'ghi'] });
  });

  it('preserves duplicate IDs in URL path (deduplication is a view concern)', () => {
    const result = parseUrl('/compare/abc,abc');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'abc'] });
  });
});

describe('buildCompareUrl', () => {
  it('returns /compare for empty array', () => {
    expect(buildCompareUrl([])).toBe('/compare');
  });

  it('returns /compare/a for single ID', () => {
    expect(buildCompareUrl(['a'])).toBe('/compare/a');
  });

  it('returns /compare/a,b for two IDs', () => {
    expect(buildCompareUrl(['a', 'b'])).toBe('/compare/a,b');
  });

  it('returns /compare/a,b,c for three IDs', () => {
    expect(buildCompareUrl(['a', 'b', 'c'])).toBe('/compare/a,b,c');
  });

  it('round-trips through parseUrl', () => {
    const ids = ['player123', 'player456'];
    const url = buildCompareUrl(ids);
    const result = parseUrl(url);
    expect(result).toEqual({ type: 'compare', playerIds: ids });
  });
});
