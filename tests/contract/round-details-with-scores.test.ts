/**
 * Contract test for round details with scores. Verifies RoundMatch shape
 * surfaces homeScore/awayScore/scheduledTime/isComplete merged from the
 * MatchRepository on top of fixtures read from the FixtureRepository.
 *
 * Spec 038: the use case now takes a `FixtureRepository` instead of pulling
 * from the legacy in-memory store, and `createGetRoundDetailsUseCase`
 * accepts the repository as its first arg.
 */

import { describe, it, expect } from 'vitest';
import { createGetRoundDetailsUseCase } from '../../src/application/use-cases/get-round-details.js';
import { InMemoryMatchRepository } from '../../src/database/in-memory-match-repository.js';
import { InMemoryFixtureRepository } from '../../src/infrastructure/persistence/in-memory-fixture-repository.js';
import { buildFixturesFromMatches } from '../../src/database/legacy-fixture-bridge.js';
import { createMatchFromSchedule, enrichWithResult, MatchStatus } from '../../src/domain/match.js';
import type { Match } from '../../src/domain/match.js';
import type { RoundMatch } from '../../src/application/results/round-details-result.js';

async function seedFixturesFromMatches(year: number, matches: Match[]): Promise<InMemoryFixtureRepository> {
  const repo = new InMemoryFixtureRepository();
  await repo.save(year, buildFixturesFromMatches(year, matches));
  return repo;
}

describe('Round Details with Scores Contract', () => {
  it('RoundMatch includes homeScore, awayScore, scheduledTime, isComplete fields', async () => {
    const matchRepository = new InMemoryMatchRepository();

    const scheduleMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });
    const enrichedMatch = enrichWithResult(scheduleMatch, {
      homeScore: 14, awayScore: 50,
      status: MatchStatus.Completed,
      scheduledTime: '2025-03-06T09:00:00Z',
    });
    await matchRepository.saveAll([enrichedMatch]);
    const fixtureRepository = await seedFixturesFromMatches(2025, [enrichedMatch]);

    const result = await createGetRoundDetailsUseCase(fixtureRepository, matchRepository).execute(2025, 1);

    expect(result.matches.length).toBeGreaterThan(0);
    const match: RoundMatch = result.matches[0];

    expect(match).toHaveProperty('homeTeam');
    expect(match).toHaveProperty('awayTeam');
    expect(match).toHaveProperty('homeStrength');
    expect(match).toHaveProperty('awayStrength');
    expect(match).toHaveProperty('homeScore');
    expect(match).toHaveProperty('awayScore');
    expect(match).toHaveProperty('scheduledTime');
    expect(match).toHaveProperty('isComplete');

    expect(match.homeScore).toBe(14);
    expect(match.awayScore).toBe(50);
    expect(match.scheduledTime).toBe('2025-03-06T09:00:00Z');
    expect(match.isComplete).toBe(true);
    expect(match.homeStrength).toBe(750);
    expect(match.awayStrength).toBe(800);
  });

  it('RoundMatch defaults to null/false when no result data exists', async () => {
    const matchRepository = new InMemoryMatchRepository();
    const scheduleMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });
    await matchRepository.saveAll([scheduleMatch]);
    const fixtureRepository = await seedFixturesFromMatches(2025, [scheduleMatch]);

    const result = await createGetRoundDetailsUseCase(fixtureRepository, matchRepository).execute(2025, 1);

    expect(result.matches.length).toBeGreaterThan(0);
    const match: RoundMatch = result.matches[0];

    expect(match.homeScore).toBeNull();
    expect(match.awayScore).toBeNull();
    expect(match.scheduledTime).toBeNull();
    expect(match.isComplete).toBe(false);
    expect(match.homeStrength).toBe(750);
    expect(match.awayStrength).toBe(800);
  });

  it('RoundMatch returns an empty matches array when the fixture artifact is absent', async () => {
    const result = await createGetRoundDetailsUseCase(new InMemoryFixtureRepository()).execute(2025, 1);
    expect(result.matches).toEqual([]);
  });
});
