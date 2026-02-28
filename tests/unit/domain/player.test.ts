import { describe, it, expect } from 'vitest';
import {
  createPlayerId,
  createPlayer,
  addPerformance,
  createMatchPerformance,
} from '../../../src/domain/player.js';

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
    const perf = createMatchPerformance({
      matchId: '2026-R1-BRO-MNL',
      year: 2026,
      round: 1,
      teamCode: 'MNL',
      tries: 2,
      goals: 0,
      tackles: 15,
      runMetres: 180,
      fantasyPoints: 65,
      isComplete: true,
    });

    expect(perf.matchId).toBe('2026-R1-BRO-MNL');
    expect(perf.tries).toBe(2);
    expect(perf.goals).toBe(0);
    expect(perf.tackles).toBe(15);
    expect(perf.runMetres).toBe(180);
    expect(perf.fantasyPoints).toBe(65);
    expect(perf.isComplete).toBe(true);
  });

  it('allows negative fantasy points', () => {
    const perf = createMatchPerformance({
      matchId: '2026-R1-BRO-MNL',
      year: 2026,
      round: 1,
      teamCode: 'MNL',
      tries: 0,
      goals: 0,
      tackles: 5,
      runMetres: 30,
      fantasyPoints: -10,
      isComplete: true,
    });
    expect(perf.fantasyPoints).toBe(-10);
  });

  it('rejects negative tries', () => {
    expect(() =>
      createMatchPerformance({
        matchId: '2026-R1-BRO-MNL',
        year: 2026,
        round: 1,
        teamCode: 'MNL',
        tries: -1,
        goals: 0,
        tackles: 0,
        runMetres: 0,
        fantasyPoints: 0,
        isComplete: false,
      })
    ).toThrow('non-negative');
  });

  it('rejects negative goals', () => {
    expect(() =>
      createMatchPerformance({
        matchId: '2026-R1-BRO-MNL',
        year: 2026,
        round: 1,
        teamCode: 'MNL',
        tries: 0,
        goals: -1,
        tackles: 0,
        runMetres: 0,
        fantasyPoints: 0,
        isComplete: false,
      })
    ).toThrow('non-negative');
  });

  it('rejects negative tackles', () => {
    expect(() =>
      createMatchPerformance({
        matchId: '2026-R1-BRO-MNL',
        year: 2026,
        round: 1,
        teamCode: 'MNL',
        tries: 0,
        goals: 0,
        tackles: -1,
        runMetres: 0,
        fantasyPoints: 0,
        isComplete: false,
      })
    ).toThrow('non-negative');
  });

  it('rejects negative run metres', () => {
    expect(() =>
      createMatchPerformance({
        matchId: '2026-R1-BRO-MNL',
        year: 2026,
        round: 1,
        teamCode: 'MNL',
        tries: 0,
        goals: 0,
        tackles: 0,
        runMetres: -1,
        fantasyPoints: 0,
        isComplete: false,
      })
    ).toThrow('non-negative');
  });
});

describe('addPerformance', () => {
  it('returns a new Player with the performance added', () => {
    const player = createPlayer('Tom Trbojevic', null, 'MNL', 'Fullback');
    const perf = createMatchPerformance({
      matchId: '2026-R1-BRO-MNL',
      year: 2026,
      round: 1,
      teamCode: 'MNL',
      tries: 2,
      goals: 0,
      tackles: 15,
      runMetres: 180,
      fantasyPoints: 65,
      isComplete: true,
    });

    const updated = addPerformance(player, perf);

    expect(updated.performances).toHaveLength(1);
    expect(updated.performances[0]).toEqual(perf);
    // Original player not mutated
    expect(player.performances).toHaveLength(0);
  });

  it('appends multiple performances', () => {
    let player = createPlayer('Tom Trbojevic', null, 'MNL', 'Fullback');

    const perf1 = createMatchPerformance({
      matchId: '2026-R1-BRO-MNL',
      year: 2026,
      round: 1,
      teamCode: 'MNL',
      tries: 2,
      goals: 0,
      tackles: 15,
      runMetres: 180,
      fantasyPoints: 65,
      isComplete: true,
    });

    const perf2 = createMatchPerformance({
      matchId: '2026-R2-MEL-MNL',
      year: 2026,
      round: 2,
      teamCode: 'MNL',
      tries: 0,
      goals: 0,
      tackles: 20,
      runMetres: 120,
      fantasyPoints: 35,
      isComplete: true,
    });

    player = addPerformance(player, perf1);
    player = addPerformance(player, perf2);

    expect(player.performances).toHaveLength(2);
    expect(player.performances[0].round).toBe(1);
    expect(player.performances[1].round).toBe(2);
  });
});
