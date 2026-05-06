import { describe, it, expect } from 'vitest';
import {
  normalizePosition,
  isStartingPosition,
  isInterchangePosition,
  isNamedPosition,
} from '../../../src/domain/positions.js';

describe('normalizePosition', () => {
  it('lowercases labels', () => {
    expect(normalizePosition('Fullback')).toBe('fullback');
  });

  it('normalises Winger to wing', () => {
    expect(normalizePosition('Winger')).toBe('wing');
  });

  it('normalises 2nd Row to second row', () => {
    expect(normalizePosition('2nd Row')).toBe('second row');
  });

  it('passes through unknown labels lowercased', () => {
    expect(normalizePosition('Reserve')).toBe('reserve');
  });
});

describe('isStartingPosition', () => {
  it('returns true for each of the nine starting positions', () => {
    const positions = ['Fullback', 'Wing', 'Centre', 'Five-Eighth', 'Halfback', 'Prop', 'Hooker', 'Second Row', 'Lock'];
    for (const pos of positions) {
      expect(isStartingPosition(pos), pos).toBe(true);
    }
  });

  it('accepts variant spellings', () => {
    expect(isStartingPosition('Winger')).toBe(true);
    expect(isStartingPosition('2nd Row')).toBe(true);
  });

  it('returns false for Interchange', () => {
    expect(isStartingPosition('Interchange')).toBe(false);
  });

  it('returns false for Reserve', () => {
    expect(isStartingPosition('Reserve')).toBe(false);
  });
});

describe('isInterchangePosition', () => {
  it('returns true for Interchange', () => {
    expect(isInterchangePosition('Interchange')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isInterchangePosition('INTERCHANGE')).toBe(true);
    expect(isInterchangePosition('interchange')).toBe(true);
  });

  it('returns false for starting positions', () => {
    expect(isInterchangePosition('Lock')).toBe(false);
    expect(isInterchangePosition('Hooker')).toBe(false);
  });

  it('returns false for Reserve', () => {
    expect(isInterchangePosition('Reserve')).toBe(false);
  });
});

describe('isNamedPosition', () => {
  it('returns true for all nine starting positions', () => {
    const positions = ['Fullback', 'Wing', 'Centre', 'Five-Eighth', 'Halfback', 'Prop', 'Hooker', 'Second Row', 'Lock'];
    for (const pos of positions) {
      expect(isNamedPosition(pos), pos).toBe(true);
    }
  });

  it('returns true for Interchange', () => {
    expect(isNamedPosition('Interchange')).toBe(true);
  });

  it('returns false for Reserve', () => {
    expect(isNamedPosition('Reserve')).toBe(false);
  });

  it('returns false for unknown labels', () => {
    expect(isNamedPosition('Unknown')).toBe(false);
    expect(isNamedPosition('Extended Squad')).toBe(false);
  });
});
