import { describe, it, expect } from 'vitest';
import {
  createPlayerId,
  createPlayer,
  addPerformance,
  createMatchPerformance,
} from '../../../src/domain/player.js';
import type { MatchPerformanceData } from '../../../src/domain/player.js';

/** Default zero-valued performance data for tests */
const DEFAULT_PERF: MatchPerformanceData = {
  matchId: '2026-R1-BRO-MNL',
  year: 2026,
  round: 1,
  teamCode: 'MNL',
  allRunMetres: 0,
  allRuns: 0,
  bombKicks: 0,
  crossFieldKicks: 0,
  conversions: 0,
  conversionAttempts: 0,
  dummyHalfRuns: 0,
  dummyHalfRunMetres: 0,
  dummyPasses: 0,
  errors: 0,
  fantasyPointsTotal: 0,
  fieldGoals: 0,
  forcedDropOutKicks: 0,
  fortyTwentyKicks: 0,
  goals: 0,
  goalConversionRate: 0,
  grubberKicks: 0,
  handlingErrors: 0,
  hitUps: 0,
  hitUpRunMetres: 0,
  ineffectiveTackles: 0,
  intercepts: 0,
  kicks: 0,
  kicksDead: 0,
  kicksDefused: 0,
  kickMetres: 0,
  kickReturnMetres: 0,
  lineBreakAssists: 0,
  lineBreaks: 0,
  lineEngagedRuns: 0,
  minutesPlayed: 0,
  missedTackles: 0,
  offloads: 0,
  offsideWithinTenMetres: 0,
  oneOnOneLost: 0,
  oneOnOneSteal: 0,
  onePointFieldGoals: 0,
  onReport: 0,
  passesToRunRatio: 0,
  passes: 0,
  playTheBallTotal: 0,
  playTheBallAverageSpeed: 0,
  penalties: 0,
  points: 0,
  penaltyGoals: 0,
  postContactMetres: 0,
  receipts: 0,
  ruckInfringements: 0,
  sendOffs: 0,
  sinBins: 0,
  stintOne: 0,
  tackleBreaks: 0,
  tackleEfficiency: 0,
  tacklesMade: 0,
  tries: 0,
  tryAssists: 0,
  twentyFortyKicks: 0,
  twoPointFieldGoals: 0,
  isComplete: false,
};

function perf(overrides: Partial<MatchPerformanceData> = {}): MatchPerformanceData {
  return { ...DEFAULT_PERF, ...overrides };
}

describe('createPlayerId', () => {
  it('normalises name to lowercase hyphenated', () => {
    expect(createPlayerId('Tom Trbojevic')).toBe('tom-trbojevic');
  });

  it('appends DOB when provided', () => {
    expect(createPlayerId('Tom Trbojevic', '1996-10-02')).toBe('tom-trbojevic-1996-10-02');
  });

  it('handles name without DOB (null)', () => {
    expect(createPlayerId('Tom Trbojevic', null)).toBe('tom-trbojevic');
  });

  it('handles name without DOB (undefined)', () => {
    expect(createPlayerId('Tom Trbojevic')).toBe('tom-trbojevic');
  });

  it('trims whitespace from name', () => {
    expect(createPlayerId('  Tom Trbojevic  ')).toBe('tom-trbojevic');
  });

  it('handles multiple spaces between words', () => {
    expect(createPlayerId('Tom  Trbojevic')).toBe('tom-trbojevic');
  });
});

describe('createPlayer', () => {
  it('creates a player with empty performances', () => {
    const player = createPlayer('Tom Trbojevic', null, 'MNL', 'Fullback');
    expect(player.id).toBe('tom-trbojevic');
    expect(player.name).toBe('Tom Trbojevic');
    expect(player.dateOfBirth).toBeNull();
    expect(player.teamCode).toBe('MNL');
    expect(player.position).toBe('Fullback');
    expect(player.performances).toEqual([]);
  });

  it('creates a player with DOB', () => {
    const player = createPlayer('Tom Trbojevic', '1996-10-02', 'MNL', 'Fullback');
    expect(player.id).toBe('tom-trbojevic-1996-10-02');
    expect(player.dateOfBirth).toBe('1996-10-02');
  });
});

describe('createMatchPerformance', () => {
  it('creates a valid performance record', () => {
    const result = createMatchPerformance(perf({
      tries: 2,
      tacklesMade: 15,
      allRunMetres: 180,
      fantasyPointsTotal: 65,
      isComplete: true,
    }));

    expect(result.matchId).toBe('2026-R1-BRO-MNL');
    expect(result.tries).toBe(2);
    expect(result.goals).toBe(0);
    expect(result.tacklesMade).toBe(15);
    expect(result.allRunMetres).toBe(180);
    expect(result.fantasyPointsTotal).toBe(65);
    expect(result.isComplete).toBe(true);
  });

  it('allows negative fantasy points', () => {
    const result = createMatchPerformance(perf({
      tacklesMade: 5,
      allRunMetres: 30,
      fantasyPointsTotal: -10,
      isComplete: true,
    }));
    expect(result.fantasyPointsTotal).toBe(-10);
  });

  it('rejects negative tries', () => {
    expect(() =>
      createMatchPerformance(perf({ tries: -1 }))
    ).toThrow('non-negative');
  });

  it('rejects negative goals', () => {
    expect(() =>
      createMatchPerformance(perf({ goals: -1 }))
    ).toThrow('non-negative');
  });

  it('rejects negative tackles', () => {
    expect(() =>
      createMatchPerformance(perf({ tacklesMade: -1 }))
    ).toThrow('non-negative');
  });

  it('rejects negative run metres', () => {
    expect(() =>
      createMatchPerformance(perf({ allRunMetres: -1 }))
    ).toThrow('non-negative');
  });
});

describe('addPerformance', () => {
  it('returns a new Player with the performance added', () => {
    const player = createPlayer('Tom Trbojevic', null, 'MNL', 'Fullback');
    const p = createMatchPerformance(perf({
      tries: 2,
      tacklesMade: 15,
      allRunMetres: 180,
      fantasyPointsTotal: 65,
      isComplete: true,
    }));

    const updated = addPerformance(player, p);

    expect(updated.performances).toHaveLength(1);
    expect(updated.performances[0]).toEqual(p);
    // Original player not mutated
    expect(player.performances).toHaveLength(0);
  });

  it('appends multiple performances', () => {
    let player = createPlayer('Tom Trbojevic', null, 'MNL', 'Fullback');

    const perf1 = createMatchPerformance(perf({
      tries: 2,
      tacklesMade: 15,
      allRunMetres: 180,
      fantasyPointsTotal: 65,
      isComplete: true,
    }));

    const perf2 = createMatchPerformance(perf({
      matchId: '2026-R2-MEL-MNL',
      round: 2,
      tacklesMade: 20,
      allRunMetres: 120,
      fantasyPointsTotal: 35,
      isComplete: true,
    }));

    player = addPerformance(player, perf1);
    player = addPerformance(player, perf2);

    expect(player.performances).toHaveLength(2);
    expect(player.performances[0].round).toBe(1);
    expect(player.performances[1].round).toBe(2);
  });
});
