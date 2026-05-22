import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LockGameStrengthRatingsUseCase } from '../../../src/application/use-cases/lock-game-strength-ratings.js';
import type { FixtureRepository } from '../../../src/application/ports/fixture-repository.js';
import type { Fixture } from '../../../src/models/fixture.js';
import type { RoundGSR } from '../../../src/domain/game-strength.js';
import type { GameStrengthRepository, GameStrengthArtifact } from '../../../src/domain/repositories/game-strength-repository.js';
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

function makeGSR(year: number, round: number): RoundGSR {
  return {
    year,
    round,
    leagueAvgTeamScore: 400,
    matches: [],
    methodology: {
      halfLifeRounds: 6,
      offenseWeight: 0.5,
      minRoundsForReliability: 3,
      seasonTransitionPenalty: 0,
      categoryWeightingMethod: 'dynamic',
    },
  };
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

/**
 * Fake unified-port repo that tracks calls and stores artifacts in a Map
 * keyed by `${year}:${round}`. Locked entries persist; provisional entries
 * can be wiped by year.
 */
class FakeGameStrengthRepo implements GameStrengthRepository {
  locked = new Map<string, GameStrengthArtifact>();
  provisional = new Map<string, GameStrengthArtifact>();
  writeLockedCalls: Array<[number, number, RoundGSR]> = [];
  writeProvisionalCalls: Array<[number, number, RoundGSR]> = [];
  deleteAllProvisionalCalls: number[] = [];
  callOrder: string[] = [];

  private key(y: number, r: number) { return `${y}:${r}`; }

  async read(year: number, round: number): Promise<GameStrengthArtifact | null> {
    const k = this.key(year, round);
    if (this.locked.has(k)) return this.locked.get(k)!;
    if (this.provisional.has(k)) return this.provisional.get(k)!;
    return null;
  }

  async writeLocked(year: number, round: number, gsr: RoundGSR): Promise<void> {
    this.writeLockedCalls.push([year, round, gsr]);
    this.callOrder.push(`writeLocked:${year}:${round}`);
    const k = this.key(year, round);
    // INSERT OR IGNORE — first write wins
    if (!this.locked.has(k)) {
      this.locked.set(k, { gsr, locked: true, lockedAt: new Date().toISOString() });
    }
  }

  async writeProvisional(year: number, round: number, gsr: RoundGSR): Promise<void> {
    this.writeProvisionalCalls.push([year, round, gsr]);
    this.callOrder.push(`writeProvisional:${year}:${round}`);
    this.provisional.set(this.key(year, round), { gsr, locked: false, lockedAt: null });
  }

  async deleteProvisional(year: number, round: number): Promise<void> {
    this.provisional.delete(this.key(year, round));
  }

  async deleteAllProvisional(year: number): Promise<void> {
    this.deleteAllProvisionalCalls.push(year);
    this.callOrder.push(`deleteAllProvisional:${year}`);
    const prefix = `${year}:`;
    for (const k of [...this.provisional.keys()]) {
      if (k.startsWith(prefix)) this.provisional.delete(k);
    }
  }

  async listLockedRounds(year: number): Promise<ReadonlySet<number>> {
    const rounds = new Set<number>();
    const prefix = `${year}:`;
    for (const k of this.locked.keys()) {
      if (k.startsWith(prefix)) rounds.add(Number(k.slice(prefix.length)));
    }
    return rounds;
  }

  async listProvisionalRounds(year: number): Promise<ReadonlySet<number>> {
    const rounds = new Set<number>();
    const prefix = `${year}:`;
    for (const k of this.provisional.keys()) {
      if (k.startsWith(prefix)) rounds.add(Number(k.slice(prefix.length)));
    }
    return rounds;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LockGameStrengthRatingsUseCase', () => {
  let repo: FakeGameStrengthRepo;

  // Round 4: BRO vs NZL (complete)
  // Round 5: BRO vs MEL (next to be locked)
  // Round 6+: future rounds
  const completedRound = 4;
  const fixtures: Fixture[] = [
    makeFixture('BRO', 'NZL', 4, true),
    makeFixture('NZL', 'BRO', 4, false),
    makeFixture('BRO', 'MEL', 5, true),
    makeFixture('MEL', 'BRO', 5, false),
    makeFixture('BRO', 'PAR', 6, true),
    makeFixture('PAR', 'BRO', 6, false),
  ];

  const scUseCase = {
    executeForTeamSeason: vi.fn(),
  } as unknown as GetSupercoachScoresUseCase;

  beforeEach(() => {
    repo = new FakeGameStrengthRepo();
    vi.mocked(scUseCase.executeForTeamSeason).mockImplementation(async (_year, code) =>
      makeSeason(code, [makeMatch('BRO', 'NZL', completedRound, true)])
    );
  });

  function makeUseCase(fixs = fixtures) {
    return new LockGameStrengthRatingsUseCase(scUseCase, makeFixtureRepo(fixs), repo);
  }

  it('is idempotent — skips when next round is already locked', async () => {
    repo.locked.set('2026:5', { gsr: makeGSR(2026, 5), locked: true, lockedAt: '2026-01-01T00:00:00Z' });
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(repo.writeLockedCalls).toHaveLength(0);
  });

  it('writes the next-round GSR via writeLocked when completed round is complete', async () => {
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(repo.writeLockedCalls).toHaveLength(1);
    expect(repo.writeLockedCalls[0][0]).toBe(2026);
    expect(repo.writeLockedCalls[0][1]).toBe(5);
  });

  it('only one writeLocked call per recompute (future rounds go through writeProvisional)', async () => {
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(repo.writeLockedCalls).toHaveLength(1);
  });

  it('wipes the year\'s provisional store before rebuilding (deleteAllProvisional precedes any writeProvisional)', async () => {
    await repo.writeProvisional(2026, 7, makeGSR(2026, 7)); // pre-populate a stale entry
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    // After the use case runs, round 7 must NOT be in the provisional map
    // (it wasn't in the test fixtures, so deleteAllProvisional removed it and
    // the rebuild loop didn't re-add it).
    const round7After = await repo.read(2026, 7);
    expect(round7After).toBeNull();
    // Verify the call ordering: deleteAllProvisional happened AFTER the
    // pre-populated writeProvisional (in beforeEach setup) and BEFORE any
    // writeProvisional calls from the use case itself.
    const deleteIdx = repo.callOrder.indexOf('deleteAllProvisional:2026');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    const firstWriteProvisionalAfterDelete = repo.callOrder
      .slice(deleteIdx + 1)
      .find(s => s.startsWith('writeProvisional:'));
    expect(firstWriteProvisionalAfterDelete).toBeDefined(); // round 6 is written after the wipe
  });

  it('populates the provisional store for future rounds (round 6 in test fixtures)', async () => {
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    const round6 = await repo.read(2026, 6);
    expect(round6).not.toBeNull();
    expect(round6?.locked).toBe(false);
    expect(round6?.gsr.round).toBe(6);
  });

  it('does not write the locked round (5) into the provisional store', async () => {
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    // Round 5 lock went through writeLocked, NOT writeProvisional
    const round5Writes = repo.writeProvisionalCalls.filter(c => c[1] === 5);
    expect(round5Writes).toHaveLength(0);
  });

  it('skips locking when completed round data is not all isComplete', async () => {
    vi.mocked(scUseCase.executeForTeamSeason).mockImplementation(async (_year, code) =>
      makeSeason(code, [makeMatch('BRO', 'NZL', completedRound, false)])
    );
    const uc = makeUseCase();
    await uc.execute(2026, completedRound);
    expect(repo.writeLockedCalls).toHaveLength(0);
  });

  it('returns early when no non-bye fixtures exist for completed round', async () => {
    const byeOnlyFixtures: Fixture[] = [makeFixture('BRO', null, completedRound, true)];
    const uc = makeUseCase(byeOnlyFixtures);
    await uc.execute(2026, completedRound);
    expect(repo.writeLockedCalls).toHaveLength(0);
  });
});
