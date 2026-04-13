import { describe, it, expect } from 'vitest';
import { parseUrl, buildCompareUrl } from '../../client/src/utils/routes';

describe('compare route parsing', () => {
  it('parses /compare with no query param to empty playerIds', () => {
    const result = parseUrl('/compare');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });

  it('parses /compare/ (trailing slash) to empty playerIds', () => {
    const result = parseUrl('/compare/');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });

  it('parses /compare?ids=abc to a single player ID', () => {
    const result = parseUrl('/compare?ids=abc');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc'] });
  });

  it('parses /compare?ids=abc,def to two player IDs', () => {
    const result = parseUrl('/compare?ids=abc,def');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'def'] });
  });

  it('parses /compare?ids=abc,def,ghi to three player IDs', () => {
    const result = parseUrl('/compare?ids=abc,def,ghi');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'def', 'ghi'] });
  });

  it('preserves duplicate IDs in URL (deduplication is a view concern)', () => {
    const result = parseUrl('/compare?ids=abc,abc');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'abc'] });
  });

  it('returns empty playerIds when ids param is empty string', () => {
    const result = parseUrl('/compare?ids=');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });
});

describe('buildCompareUrl', () => {
  it('returns /compare for empty array', () => {
    expect(buildCompareUrl([])).toBe('/compare');
  });

  it('returns /compare?ids=a for single ID', () => {
    expect(buildCompareUrl(['a'])).toBe('/compare?ids=a');
  });

  it('returns /compare?ids=a,b for two IDs', () => {
    expect(buildCompareUrl(['a', 'b'])).toBe('/compare?ids=a,b');
  });

  it('returns /compare?ids=a,b,c for three IDs', () => {
    expect(buildCompareUrl(['a', 'b', 'c'])).toBe('/compare?ids=a,b,c');
  });

  it('round-trips through parseUrl', () => {
    const ids = ['player123', 'player456'];
    const url = buildCompareUrl(ids);
    const result = parseUrl(url);
    expect(result).toEqual({ type: 'compare', playerIds: ids });
  });
});
