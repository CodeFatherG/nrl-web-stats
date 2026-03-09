/**
 * T026: Contract test for round details with scores.
 * Verifies RoundMatch response shape includes score/status fields.
 */

import { describe, it, expect } from 'vitest';
import { createGetRoundDetailsUseCase } from '../../src/application/use-cases/get-round-details.js';
import { InMemoryMatchRepository } from '../../src/database/in-memory-match-repository.js';
import { createMatchFromSchedule, enrichWithResult, MatchStatus } from '../../src/domain/match.js';
import type { RoundMatch } from '../../src/application/results/round-details-result.js';

describe('Round Details with Scores Contract', () => {
  it('RoundMatch includes homeScore, awayScore, scheduledTime, isComplete fields', async () => {
    const matchRepository = new InMemoryMatchRepository();

    // Load schedule data
    const scheduleMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });

    // Enrich with result data
    const enrichedMatch = enrichWithResult(scheduleMatch, {
      homeScore: 14, awayScore: 50,
      status: MatchStatus.Completed,
      scheduledTime: '2025-03-06T09:00:00Z',
    });

    await matchRepository.saveAll([enrichedMatch]);

    const result = await createGetRoundDetailsUseCase(matchRepository).execute(2025, 1);

    expect(result.matches.length).toBeGreaterThan(0);

    const match: RoundMatch = result.matches[0];

    // Verify all required fields exist in response shape
    expect(match).toHaveProperty('homeTeam');
    expect(match).toHaveProperty('awayTeam');
    expect(match).toHaveProperty('homeStrength');
    expect(match).toHaveProperty('awayStrength');
    expect(match).toHaveProperty('homeScore');
    expect(match).toHaveProperty('awayScore');
    expect(match).toHaveProperty('scheduledTime');
    expect(match).toHaveProperty('isComplete');

    // Verify actual values
    expect(match.homeScore).toBe(14);
    expect(match.awayScore).toBe(50);
    expect(match.scheduledTime).toBe('2025-03-06T09:00:00Z');
    expect(match.isComplete).toBe(true);
    expect(match.homeStrength).toBe(750);
    expect(match.awayStrength).toBe(800);
  });

  it('RoundMatch defaults to null/false when no result data exists', async () => {
    const matchRepository = new InMemoryMatchRepository();

    // Load schedule data without enrichment
    const scheduleMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });

    await matchRepository.saveAll([scheduleMatch]);

    const result = await createGetRoundDetailsUseCase(matchRepository).execute(2025, 1);

    expect(result.matches.length).toBeGreaterThan(0);

    const match: RoundMatch = result.matches[0];

    // Score fields should be null/false (no result data)
    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
    expect(match.scheduledTime).toBeNull();
    expect(match.isComplete).toBe(false);

    // Strength data should still be present
    expect(match.homeStrength).toBe(750);
    expect(match.awayStrength).toBe(800);
  });

  it('RoundMatch defaults to null/false without matchRepository', async () => {
    // Without matchRepository (backward-compatible)
    const result = await createGetRoundDetailsUseCase().execute(2025, 1);

    for (const match of result.matches) {
      expect(match.homeScore).toBeNull();
      expect(match.awayScore).toBeNull();
      expect(match.scheduledTime).toBeNull();
      expect(match.isComplete).toBe(false);
    }
  });
});
