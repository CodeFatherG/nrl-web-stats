import { describe, it, expect } from 'vitest';
import { parseUrl, buildCompareUrl } from '../../client/src/utils/routes';

describe('compare route parsing', () => {
  it('parses /compare with no query params to empty playerIds', () => {
    const result = parseUrl('/compare');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });

  it('parses /compare/ (trailing slash) to empty playerIds', () => {
    const result = parseUrl('/compare/');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });

  it('parses /compare?id=abc to a single player ID', () => {
    const result = parseUrl('/compare?id=abc');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc'] });
  });

  it('parses /compare?id=abc&id=def to two player IDs', () => {
    const result = parseUrl('/compare?id=abc&id=def');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'def'] });
  });

  it('parses /compare?id=abc&id=def&id=ghi to three player IDs', () => {
    const result = parseUrl('/compare?id=abc&id=def&id=ghi');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'def', 'ghi'] });
  });

  it('preserves duplicate IDs in URL (deduplication is a view concern)', () => {
    const result = parseUrl('/compare?id=abc&id=abc');
    expect(result).toEqual({ type: 'compare', playerIds: ['abc', 'abc'] });
  });

  it('returns empty playerIds when no id params present', () => {
    const result = parseUrl('/compare?other=value');
    expect(result).toEqual({ type: 'compare', playerIds: [] });
  });
});

describe('buildCompareUrl', () => {
  it('returns /compare for empty array', () => {
    expect(buildCompareUrl([])).toBe('/compare');
  });

  it('returns /compare?id=a for single ID', () => {
    expect(buildCompareUrl(['a'])).toBe('/compare?id=a');
  });

  it('returns /compare?id=a&id=b for two IDs', () => {
    expect(buildCompareUrl(['a', 'b'])).toBe('/compare?id=a&id=b');
  });

  it('returns /compare?id=a&id=b&id=c for three IDs', () => {
    expect(buildCompareUrl(['a', 'b', 'c'])).toBe('/compare?id=a&id=b&id=c');
  });

  it('round-trips through parseUrl', () => {
    const ids = ['player123', 'player456'];
    const url = buildCompareUrl(ids);
    const result = parseUrl(url);
    expect(result).toEqual({ type: 'compare', playerIds: ids });
  });
});
