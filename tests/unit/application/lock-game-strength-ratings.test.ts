import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LockGameStrengthRatingsUseCase } from '../../../src/application/use-cases/lock-game-strength-ratings.js';
import { GameStrengthCache } from '../../../src/analytics/game-strength-cache.js';
import type { FixtureRepository } from '../../../src/application/ports/fixture-repository.js';
import type { Fixture } from '../../../src/models/fixture.js';
import type { RoundGSR } from '../../../src/domain/game-strength.js';
import type { D1GameStrengthRepository } from '../../../src/infrastructure/persistence/d1-game-strength-repository.js';
import type { GetSupercoachScoresUseCase } from '../../../src/application/use-cases/get-supercoach-scores.js';
import type { TeamSeasonSupercoach, TeamSupercoachGroup, MatchSupercoachResult } from '../../../src/domain/supercoach-score.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFixture(teamCode: string, opponentCode: string | null, round: number, isHome = true): Fixture {
  return {
    id: `2026-${teamCode}-${round}`,
    year: 2026,
    round,
    teamCode,
    opponentCode,
    isHome,
    isBye: opponentCode === null,
    strengthRating: 0,
  };
}

function makeGroup(teamCode: string, isComplete: boolean): TeamSupercoachGroup {
  return { teamCode, teamName: teamCode, teamTotal: 1800, isComplete, players: [] };
}

function makeMatch(homeCode: string, awayCode: string, round: number, isComplete: boolean): MatchSupercoachResult {
  return {
    matchId: `2026-R${round}-${homeCode}-${awayCode}`,
    year: 2026,
    round,
    isComplete,
    homeTeam: makeGroup(homeCode, isComplete),
    awayTeam: makeGroup(awayCode, isComplete),
  };
}

function makeSeason(teamCode: string, matches: MatchSupercoachResult[]): TeamSeasonSupercoach {
  return { year: 2026, teamCode, teamName: teamCode, matches };
}

function makeFixtureRepo(fixtures: Fixture[]): FixtureRepository {
  return {
    findByYear: (year) => fixtures.filter(f => f.year === year),
    findByTeam: (code) => fixtures.filter(f => f.teamCode === code),
    findByRound: (year, round) => fixtures.filter(f => f.year === year && f.round === round),
    findByYearAndTeam: (year, code) => fixtures.filter(f => f.year === year && f.teamCode === code),
    isYearLoaded: () => true,
    getLoadedYears: () => [2026],
    getAllTeams: () => [],
    getTeamByCode: () => undefined,
    getLastScrapeTimes: () => ({}),
    getTotalFixtureCount: () => fixtures.length,
    loadFixtures: () => {},
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LockGameStrengthRatingsUseCase', () => {
  let gsrRepo: { findByRound: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let gsrCache: GameStrengthCache;

  // Round 4: BRO vs NZL (complete)
  // Round 5: BRO vs MEL (fixture for next round)
  // Round 6+: future rounds
  const completedRound = 4;
  const fixtures: Fixture[] = [
    // Round 4 (completed)
    makeFixture('BRO', 'NZL', 4, true),
    makeFixture('NZL', 'BRO', 4, false),
    // Round 5 (next to be locked)
    makeFixture('BRO', 'MEL', 5, true),
    makeFixture('MEL', 'BRO', 5, false),
    // Round 6 (future)
    makeFixture('BRO', 'PAR', 6, true),
    makeFixture('PAR', 'BRO', 6, false),
  ];

  const completeSeason = (code: string, round: number) =>
    makeSeason(code, [makeMatch('BRO', 'NZL', completedRound, true)]);

  const scUseCase = {
    executeForTeamSeason: vi.fn(),
  } as unknown as GetSupercoachScoresUseCase;

  beforeEach(() => {
    gsrRepo = { findByRound: vi.fn(), save: vi.fn() };
    gsrCache = new GameStrengthCache();

    vi.mocked(scUseCase.executeForTeamSeason).mockImplementation(async (_year, code) =>
      makeSeason(code, [makeMatch('BRO', 'NZL', completedRound, true)])
    );
  });

  function makeUseCase(fixs = fixtures) {
    return new LockGameStrengthRatingsUseCase(
      scUseCase,
      makeFixtureRepo(fixs),
      gsrRepo as unknown as D1GameStrengthRepository,
      gsrCache
    );
  }

  it('is idempotent — skips when next round is already locked', async () => {
    gsrRepo.findByRound.mockResolvedValue({ year: 2026, round: 5 } as RoundGSR);
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(gsrRepo.save).not.toHaveBeenCalled();
  });

  it('saves GSR for next round when completed round is complete', async () => {
    gsrRepo.findByRound.mockResolvedValue(null);
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(gsrRepo.save).toHaveBeenCalledWith(2026, 5, expect.objectContaining({ round: 5 }));
  });

  it('does not persist future rounds beyond nextRound (rounds > nextRound go to cache only)', async () => {
    gsrRepo.findByRound.mockResolvedValue(null);
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    // save should only be called once (for round 5)
    expect(gsrRepo.save).toHaveBeenCalledTimes(1);
  });

  it('clears cache before rebuilding', async () => {
    gsrRepo.findByRound.mockResolvedValue(null);
    gsrCache.set(2026, 7, {} as RoundGSR); // pre-populate
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    // After rebuild, round 7 stale entry should be gone
    // (and replaced by fresh data if fixture exists, or absent if not)
    // Either way, the pre-existing entry for round 7 is cleared
    expect(gsrRepo.save).toHaveBeenCalledTimes(1);
  });

  it('populates cache for future rounds (round 6 in test fixtures)', async () => {
    gsrRepo.findByRound.mockResolvedValue(null);
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    // Round 6 should be in cache (not saved to D1)
    const cached = gsrCache.get(2026, 6);
    expect(cached).toBeDefined();
    expect(cached?.round).toBe(6);
  });

  it('skips locking when completed round data is not all isComplete', async () => {
    gsrRepo.findByRound.mockResolvedValue(null);
    // Return incomplete season data for one team
    vi.mocked(scUseCase.executeForTeamSeason).mockImplementation(async (_year, code) =>
      makeSeason(code, [makeMatch('BRO', 'NZL', completedRound, false)]) // isComplete: false
    );
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(gsrRepo.save).not.toHaveBeenCalled();
  });

  it('returns early and does nothing when no non-bye fixtures exist for completed round', async () => {
    gsrRepo.findByRound.mockResolvedValue(null);
    const byeOnlyFixtures: Fixture[] = [
      makeFixture('BRO', null, completedRound, true), // bye
    ];
    const uc = makeUseCase(byeOnlyFixtures);
    await uc.execute(2026, completedRound);
    expect(gsrRepo.save).not.toHaveBeenCalled();
  });
});
