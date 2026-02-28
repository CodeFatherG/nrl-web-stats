import { describe, it, expect } from 'vitest';
import {
  MatchStatus,
  createMatchId,
  createMatchFromSchedule,
  createMatchFromResult,
  enrichWithSchedule,
  enrichWithResult,
} from '../../../src/domain/match.js';
import type { Match } from '../../../src/domain/match.js';

describe('createMatchId', () => {
  it('generates deterministic ID with teams sorted alphabetically', () => {
    expect(createMatchId('MEL', 'BRO', 2026, 1)).toBe('2026-R1-BRO-MEL');
  });

  it('produces same ID regardless of team parameter order', () => {
    const id1 = createMatchId('MEL', 'BRO', 2026, 1);
    const id2 = createMatchId('BRO', 'MEL', 2026, 1);
    expect(id1).toBe(id2);
  });

  it('includes round number in ID', () => {
    expect(createMatchId('MEL', 'BRO', 2026, 15)).toBe('2026-R15-BRO-MEL');
  });

  it('handles finals rounds beyond 27', () => {
    expect(createMatchId('MEL', 'BRO', 2026, 28)).toBe('2026-R28-BRO-MEL');
  });
});

describe('createMatchFromSchedule', () => {
  it('creates a match with schedule data and null result fields', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    expect(match.id).toBe('2026-R1-BRO-MEL');
    expect(match.year).toBe(2026);
    expect(match.round).toBe(1);
    expect(match.homeTeamCode).toBe('MEL');
    expect(match.awayTeamCode).toBe('BRO');
    expect(match.homeStrengthRating).toBe(3.5);
    expect(match.awayStrengthRating).toBe(-2.1);
    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
    expect(match.status).toBe(MatchStatus.Scheduled);
    expect(match.scheduledTime).toBeNull();
  });
});

describe('createMatchFromResult', () => {
  it('creates a match with result data and null schedule fields', () => {
    const match = createMatchFromResult({
      teamA: 'MEL',
      teamB: 'BRO',
      year: 2026,
      round: 1,
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: '2026-03-06T19:50:00+11:00',
    });

    expect(match.id).toBe('2026-R1-BRO-MEL');
    expect(match.year).toBe(2026);
    expect(match.round).toBe(1);
    expect(match.homeTeamCode).toBeNull();
    expect(match.awayTeamCode).toBeNull();
    expect(match.homeStrengthRating).toBeNull();
    expect(match.awayStrengthRating).toBeNull();
    expect(match.homeScore).toBe(24);
    expect(match.awayScore).toBe(18);
    expect(match.status).toBe(MatchStatus.Completed);
    expect(match.scheduledTime).toBe('2026-03-06T19:50:00+11:00');
  });
});

describe('enrichWithResult', () => {
  it('adds result data to a schedule-only match', () => {
    const scheduleMatch = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    const enriched = enrichWithResult(scheduleMatch, {
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: '2026-03-06T19:50:00+11:00',
    });

    // Schedule data preserved
    expect(enriched.homeTeamCode).toBe('MEL');
    expect(enriched.awayTeamCode).toBe('BRO');
    expect(enriched.homeStrengthRating).toBe(3.5);
    expect(enriched.awayStrengthRating).toBe(-2.1);

    // Result data added
    expect(enriched.homeScore).toBe(24);
    expect(enriched.awayScore).toBe(18);
    expect(enriched.status).toBe(MatchStatus.Completed);
    expect(enriched.scheduledTime).toBe('2026-03-06T19:50:00+11:00');
  });

  it('does not clear existing non-null fields', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    const enriched = enrichWithResult(match, {
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: null, // null scheduledTime should not clear anything
    });

    expect(enriched.scheduledTime).toBeNull(); // was already null
    expect(enriched.homeTeamCode).toBe('MEL'); // schedule fields untouched
  });

  it('is idempotent — applying same result data twice produces identical match', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    const resultData = {
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed as MatchStatus,
      scheduledTime: '2026-03-06T19:50:00+11:00',
    };

    const enriched1 = enrichWithResult(match, resultData);
    const enriched2 = enrichWithResult(enriched1, resultData);

    expect(enriched2).toEqual(enriched1);
  });
});

describe('enrichWithSchedule', () => {
  it('adds schedule data to a result-only match', () => {
    const resultMatch = createMatchFromResult({
      teamA: 'MEL',
      teamB: 'BRO',
      year: 2026,
      round: 1,
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: '2026-03-06T19:50:00+11:00',
    });

    const enriched = enrichWithSchedule(resultMatch, {
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    // Result data preserved
    expect(enriched.homeScore).toBe(24);
    expect(enriched.awayScore).toBe(18);
    expect(enriched.status).toBe(MatchStatus.Completed);

    // Schedule data added
    expect(enriched.homeTeamCode).toBe('MEL');
    expect(enriched.awayTeamCode).toBe('BRO');
    expect(enriched.homeStrengthRating).toBe(3.5);
    expect(enriched.awayStrengthRating).toBe(-2.1);
  });

  it('does not overwrite existing non-null schedule fields', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    const enriched = enrichWithSchedule(match, {
      homeTeamCode: 'PTH',
      awayTeamCode: 'SYD',
      homeStrengthRating: 5.0,
      awayStrengthRating: -5.0,
    });

    // Original values preserved — not overwritten
    expect(enriched.homeTeamCode).toBe('MEL');
    expect(enriched.awayTeamCode).toBe('BRO');
    expect(enriched.homeStrengthRating).toBe(3.5);
    expect(enriched.awayStrengthRating).toBe(-2.1);
  });

  it('is idempotent', () => {
    const match = createMatchFromResult({
      teamA: 'MEL',
      teamB: 'BRO',
      year: 2026,
      round: 1,
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: null,
    });

    const scheduleData = {
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    };

    const enriched1 = enrichWithSchedule(match, scheduleData);
    const enriched2 = enrichWithSchedule(enriched1, scheduleData);

    expect(enriched2).toEqual(enriched1);
  });
});

describe('Match status transitions', () => {
  it('defaults to Scheduled when created from schedule data', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });
    expect(match.status).toBe(MatchStatus.Scheduled);
  });

  it('can transition from Scheduled to InProgress via enrichment', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    const enriched = enrichWithResult(match, {
      homeScore: 10,
      awayScore: 6,
      status: MatchStatus.InProgress,
      scheduledTime: null,
    });

    expect(enriched.status).toBe(MatchStatus.InProgress);
  });

  it('can skip InProgress and go directly to Completed', () => {
    const match = createMatchFromSchedule({
      homeTeamCode: 'MEL',
      awayTeamCode: 'BRO',
      year: 2026,
      round: 1,
      homeStrengthRating: 3.5,
      awayStrengthRating: -2.1,
    });

    const enriched = enrichWithResult(match, {
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: null,
    });

    expect(enriched.status).toBe(MatchStatus.Completed);
  });

  it('does not transition backward from Completed', () => {
    const match = createMatchFromResult({
      teamA: 'MEL',
      teamB: 'BRO',
      year: 2026,
      round: 1,
      homeScore: 24,
      awayScore: 18,
      status: MatchStatus.Completed,
      scheduledTime: null,
    });

    const enriched = enrichWithResult(match, {
      homeScore: 10,
      awayScore: 6,
      status: MatchStatus.Scheduled,
      scheduledTime: null,
    });

    expect(enriched.status).toBe(MatchStatus.Completed);
  });

  it('does not transition backward from InProgress to Scheduled', () => {
    const match = createMatchFromResult({
      teamA: 'MEL',
      teamB: 'BRO',
      year: 2026,
      round: 1,
      homeScore: 10,
      awayScore: 6,
      status: MatchStatus.InProgress,
      scheduledTime: null,
    });

    const enriched = enrichWithResult(match, {
      homeScore: 10,
      awayScore: 6,
      status: MatchStatus.Scheduled,
      scheduledTime: null,
    });

    expect(enriched.status).toBe(MatchStatus.InProgress);
  });
});
