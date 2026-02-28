import { describe, it, expect } from 'vitest';
import { createScore, scoreMargin, scoreWinner, MatchStatus } from '../../../src/domain/match.js';

describe('Score value object', () => {
  it('creates a valid score', () => {
    const score = createScore(24, 18);
    expect(score.home).toBe(24);
    expect(score.away).toBe(18);
  });

  it('allows zero scores', () => {
    const score = createScore(0, 0);
    expect(score.home).toBe(0);
    expect(score.away).toBe(0);
  });

  it('rejects negative home score', () => {
    expect(() => createScore(-1, 10)).toThrow('non-negative');
  });

  it('rejects negative away score', () => {
    expect(() => createScore(10, -1)).toThrow('non-negative');
  });

  it('rejects non-integer home score', () => {
    expect(() => createScore(10.5, 10)).toThrow('integers');
  });

  it('rejects non-integer away score', () => {
    expect(() => createScore(10, 10.5)).toThrow('integers');
  });

  it('calculates margin correctly', () => {
    expect(scoreMargin(createScore(24, 18))).toBe(6);
    expect(scoreMargin(createScore(18, 24))).toBe(6);
    expect(scoreMargin(createScore(20, 20))).toBe(0);
  });

  it('determines home winner', () => {
    expect(scoreWinner(createScore(24, 18))).toBe('home');
  });

  it('determines away winner', () => {
    expect(scoreWinner(createScore(18, 24))).toBe('away');
  });

  it('detects draw', () => {
    expect(scoreWinner(createScore(20, 20))).toBeNull();
  });
});

describe('MatchStatus', () => {
  it('has Scheduled value', () => {
    expect(MatchStatus.Scheduled).toBe('Scheduled');
  });

  it('has InProgress value', () => {
    expect(MatchStatus.InProgress).toBe('InProgress');
  });

  it('has Completed value', () => {
    expect(MatchStatus.Completed).toBe('Completed');
  });

  it('has exactly three values', () => {
    expect(Object.keys(MatchStatus)).toHaveLength(3);
  });
});
