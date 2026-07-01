/**
 * Unit tests for PrecomputeLeagueRoundProjectionsUseCase.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PrecomputeLeagueRoundProjectionsUseCase } from '../../src/application/use-cases/precompute-league-round-projections.js';
import { InMemoryLeagueRoundProjectionsRepository } from '../../src/infrastructure/persistence/in-memory-league-round-projections-repository.js';
import { InMemoryProjectionRepository } from '../../src/infrastructure/cache/in-memory-projection-repository.js';
import { MatchStatus } from '../../src/domain/match.js';
import type { Match } from '../../src/domain/match.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type {
  PlayerRepository,
  PlayerSeasonSummary,
  SeasonAggregates,
} from '../../src/domain/repositories/player-repository.js';
import type { Player, MatchPerformance } from '../../src/domain/player.js';
import type { SupplementaryPlayerStats } from '../../src/domain/ports/supplementary-stats-source.js';
import type {
  TeamRankingsAggregate,
  PlayerProjectionAggregate,
} from '../../src/domain/repositories/projection-repository.js';
import type { ContextualProfileResult } from '../../src/analytics/contextual-projection-types.js';
import type { PlayerProjectionProfile, RankingMode } from '../../src/analytics/player-projection-types.js';
import type { TeamListRepository } from '../../src/domain/repositories/team-list-repository.js';
import type { TeamList } from '../../src/domain/team-list.js';

const YEAR = 2026;
const ROUND = 5;
const AS_OF = 5;

// ── Fakes ────────────────────────────────────────────────────────────────────

function fakeMatch(home: string, away: string, stadium: string | null = 'Suncorp Stadium'): Match {
  return {
    id: `${YEAR}-R${ROUND}-${home}-${away}`,
    year: YEAR,
    round: ROUND,
    homeTeamCode: home,
    awayTeamCode: away,
    homeStrengthRating: 0.5,
    awayStrengthRating: 0.5,
    homeScore: null,
    awayScore: null,
    status: MatchStatus.Scheduled,
    scheduledTime: null,
    stadium,
    weather: null,
  };
}

function fakeSummary(playerId: string, teamCode: string, name = `Player ${playerId}`): PlayerSeasonSummary {
  return {
    playerId,
    playerName: name,
    teamCode,
    position: 'Centre',
    scPosition: 'CTR',
    gamesPlayed: 10,
    totalTries: 0,
    totalRunMetres: 0,
    totalTacklesMade: 0,
    totalPoints: 0,
    averageFantasyPoints: 0,
    totalTackleBreaks: 0,
    totalLineBreaks: 0,
  };
}

function fakeProfile(playerId: string, teamCode: string, total = 50): PlayerProjectionProfile {
  return {
    playerId,
    playerName: `Player ${playerId}`,
    teamCode,
    position: 'Centre',
    avgMinutes: 70,
    floorMean: 30, floorStd: 5, floorCv: 0.16, floorPerMinute: 0.4,
    spikeMean: 20, spikeStd: 6, spikeCv: 0.3, spikePerMinute: 0.28,
    spikeP25: 15, spikeP50: 18, spikeP75: 22, spikeP90: 28,
    spikeDistribution: {
      negative: { count: 0, frequency: 0 }, nil: { count: 0, frequency: 0 },
      low: { count: 0, frequency: 0 }, moderate: { count: 0, frequency: 0 },
      high: { count: 0, frequency: 0 }, boom: { count: 0, frequency: 0 },
    },
    projectedTotal: total,
    projectedFloor: total - 10,
    projectedCeiling: total + 10,
    gamesPlayed: 10, lowSampleWarning: false, noUsableData: false,
    games: [],
  };
}

function fakeContextualProfile(
  playerId: string,
  teamCode: string,
  opponents: Record<string, number> = {},
  venues: Record<string, number> = {},
): ContextualProfileResult {
  const adjOpp = (multiplier: number) => ({
    multiplier, confidence: 1, sampleN: 5,
    defenseFactor: 1, defenseConfidence: 1, h2hRpi: multiplier, h2hConfidence: 1,
  });
  const adjVenue = (multiplier: number) => ({ multiplier, confidence: 1, sampleN: 3, stadiumId: 'suncorp' });
  return {
    playerId,
    playerName: `Player ${playerId}`,
    teamCode,
    position: 'Centre',
    year: YEAR,
    baseProjection: { total: 50, floor: 40, ceiling: 60 },
    opponents: Object.fromEntries(Object.entries(opponents).map(([k, v]) => [k, adjOpp(v)])),
    venues: Object.fromEntries(Object.entries(venues).map(([k, v]) => [k, adjVenue(v)])),
    weather: {},
  };
}

function fakeTeamRanking(
  teamCode: string,
  mode: RankingMode,
  players: Array<{ playerId: string; compositeScore: number; baseTotal?: number }>,
): TeamRankingsAggregate {
  return {
    year: YEAR,
    teamCode,
    mode,
    asOfRound: AS_OF,
    computedAt: new Date().toISOString(),
    rankings: {
      teamCode,
      year: YEAR,
      mode,
      excludedCount: 0,
      rankedPlayers: players.map((p, i) => ({
        rank: i + 1,
        compositeScore: p.compositeScore,
        profile: fakeProfile(p.playerId, teamCode, p.baseTotal ?? 50),
      })),
    },
  };
}

function fakePlayerAggregate(
  playerId: string,
  teamCode: string,
  baseTotal: number,
  contextual: ContextualProfileResult,
): PlayerProjectionAggregate {
  return {
    playerId,
    year: YEAR,
    asOfRound: AS_OF,
    computedAt: new Date().toISOString(),
    baseProfile: fakeProfile(playerId, teamCode, baseTotal),
    contextualProfile: contextual,
  };
}

function fakeTeamList(
  matchId: string,
  teamCode: string,
  members: Array<{ playerId: string; playerName: string; jersey?: number }>,
): TeamList {
  return {
    matchId,
    teamCode,
    year: YEAR,
    round: ROUND,
    members: members.map((m, i) => ({
      jerseyNumber: m.jersey ?? i + 1,
      playerName: m.playerName,
      position: 'Centre',
      playerId: Number(m.playerId),
    })),
    scrapedAt: new Date().toISOString(),
  };
}

// ── Stub repositories ────────────────────────────────────────────────────────

class StubMatchRepo implements MatchRepository {
  constructor(private readonly roundMatches: Match[]) {}
  async findByYearAndRound() { return this.roundMatches; }
  async findByYear() { return this.roundMatches; }
  async findByTeam() { return []; }
  async findById() { return null; }
  async getLoadedYears() { return [YEAR]; }
  async isYearLoaded() { return true; }
  async getMatchCount() { return this.roundMatches.length; }
  async save() {}
  async saveAll() {}
}

class StubPlayerRepo implements PlayerRepository {
  constructor(private readonly summaries: PlayerSeasonSummary[]) {}
  async findAllSeasonSummaries() { return this.summaries; }
  async findById(): Promise<Player | null> { return null; }
  async findByTeam(): Promise<Player[]> { return []; }
  async findMatchPerformances(): Promise<MatchPerformance[]> { return []; }
  async findSeasonAggregates(): Promise<SeasonAggregates | null> { return null; }
  async isRoundComplete() { return false; }
  async countDistinctMatchesInRound() { return 0; }
  async findPerformancesByMatch() { return []; }
  async findAllSeasonPerformancesSummary() { return []; }
  async save() {}
}

class StubSuppRepo {
  constructor(private readonly rows: SupplementaryPlayerStats[]) {}
  async findByRound() { return this.rows; }
}

class StubTeamListRepo implements TeamListRepository {
  constructor(private readonly lists: TeamList[] = []) {}
  async save() {}
  async saveAll() {}
  async findByMatch(matchId: string): Promise<TeamList[]> {
    return this.lists.filter(l => l.matchId === matchId);
  }
  async findByYearAndRound(year: number, round: number): Promise<TeamList[]> {
    return this.lists.filter(l => l.year === year && l.round === round);
  }
  async hasTeamList(matchId: string, teamCode: string): Promise<boolean> {
    return this.lists.some(l => l.matchId === matchId && l.teamCode === teamCode);
  }
  async hasTeamListsForMatch(matchId: string): Promise<boolean> {
    return this.lists.some(l => l.matchId === matchId);
  }
  async getRoundsWithTeamLists(year: number): Promise<Set<number>> {
    return new Set(this.lists.filter(l => l.year === year).map(l => l.round));
  }
  async findRoundsWithCompleteTeamLists(): Promise<ReadonlySet<number>> {
    return new Set();
  }
}

function suppRow(name: string, teamCode: string, breakEven: number | null, price = 500000): SupplementaryPlayerStats {
  return {
    playerName: name, season: YEAR, round: ROUND,
    lastTouch: 0, missedGoals: 0, missedFieldGoals: 0,
    effectiveOffloads: 0, ineffectiveOffloads: 0,
    runsOver8m: 0, runsUnder8m: 0,
    trySaves: 0, kickRegatherBreak: 0, heldUpInGoal: 0,
    price, breakEven, teamCode, scPosition: 'CTR',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PrecomputeLeagueRoundProjectionsUseCase', () => {
  let projectionRepo: InMemoryProjectionRepository;
  let leagueRepo: InMemoryLeagueRoundProjectionsRepository;

  beforeEach(() => {
    projectionRepo = new InMemoryProjectionRepository();
    leagueRepo = new InMemoryLeagueRoundProjectionsRepository();
  });

  it('writes top/bottom break-evens and contextual top scorers + captains', async () => {
    // Two-team round: BRI plays MEL at Suncorp Stadium.
    const match = fakeMatch('BRI', 'MEL', 'Suncorp Stadium');
    const matchRepo = new StubMatchRepo([match]);
    const summaries = [
      fakeSummary('101', 'BRI', 'Alice Smith'),
      fakeSummary('102', 'BRI', 'Bob Jones'),
      fakeSummary('201', 'MEL', 'Cam Brown'),
    ];
    const playerRepo = new StubPlayerRepo(summaries);
    const suppRepo = new StubSuppRepo([
      suppRow('Alice Smith', 'BRI', 100, 600000),
      suppRow('Bob Jones', 'BRI', -10, 200000),
      suppRow('Cam Brown', 'MEL', 50, 400000),
      suppRow('Dan Null', 'MEL', null, 300000), // filtered out (null break-even)
    ]);
    const teamListRepo = new StubTeamListRepo([
      fakeTeamList(match.id, 'BRI', [
        { playerId: '101', playerName: 'Alice Smith' },
        { playerId: '102', playerName: 'Bob Jones' },
      ]),
      fakeTeamList(match.id, 'MEL', [
        { playerId: '201', playerName: 'Cam Brown' },
      ]),
    ]);

    // Seed team rankings for both modes
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('BRI', 'composite', [
      { playerId: '101', compositeScore: 90 },
      { playerId: '102', compositeScore: 80 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('MEL', 'composite', [
      { playerId: '201', compositeScore: 85 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('BRI', 'captaincy', [
      { playerId: '101', compositeScore: 110 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('MEL', 'captaincy', [
      { playerId: '201', compositeScore: 105 },
    ]));

    // Seed player aggregates with contextual profiles. Alice gets +20% vs MEL,
    // Bob no adjustment, Cam +10% vs BRI + venue.
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      '101', 'BRI', 60,
      fakeContextualProfile('101', 'BRI', { MEL: 1.2 }, { suncorp: 1.05 }),
    ));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      '102', 'BRI', 50,
      fakeContextualProfile('102', 'BRI'),
    ));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      '201', 'MEL', 55,
      fakeContextualProfile('201', 'MEL', { BRI: 1.1 }, { suncorp: 1.0 }),
    ));

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    expect(artifact).not.toBeNull();
    expect(artifact!.asOfRound).toBe(AS_OF);

    // Break-evens: top sorted desc, bottom sorted asc. Null break_even filtered.
    expect(artifact!.breakEvens.top[0]).toMatchObject({ playerName: 'Alice Smith', breakEven: 100 });
    expect(artifact!.breakEvens.bottom[0]).toMatchObject({ playerName: 'Bob Jones', breakEven: -10 });
    // playerId resolved from season summary
    expect(artifact!.breakEvens.top[0].playerId).toBe('101');

    // Scorers: Alice's adjusted = 60 * 1.2 * 1.05 = 75.6 (top); Cam = 55 * 1.1 * 1.0 = 60.5; Bob = 50.
    expect(artifact!.scorers[0].playerId).toBe('101');
    expect(artifact!.scorers[0].adjustedTotal).toBeCloseTo(75.6);
    expect(artifact!.scorers[0].opponent).toBe('MEL');
    expect(artifact!.scorers[0].venue).toBe('suncorp');
    expect(artifact!.scorers[1].playerId).toBe('201');

    // Captains: Alice still tops via base 60 * 1.2 * 1.05; Cam second.
    expect(artifact!.captains[0].playerId).toBe('101');
    expect(artifact!.captains).toHaveLength(2);
  });

  it('skips candidates whose team is on bye (no fixture in round)', async () => {
    // SYD has a (hypothetical) team list in our stub but no fixture this round,
    // so the bye filter in rankWithContext should still drop them after the
    // named-player filter lets them through.
    const match = fakeMatch('BRI', 'MEL', 'Suncorp Stadium');
    const matchRepo = new StubMatchRepo([match]);
    const playerRepo = new StubPlayerRepo([fakeSummary('301', 'SYD', 'Syd Player')]);
    const suppRepo = new StubSuppRepo([]);
    const teamListRepo = new StubTeamListRepo([
      fakeTeamList('2026-R5-SYD-XXX', 'SYD', [
        { playerId: '301', playerName: 'Syd Player' },
      ]),
    ]);

    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('SYD', 'composite', [
      { playerId: '301', compositeScore: 90 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('SYD', 'captaincy', [
      { playerId: '301', compositeScore: 90 },
    ]));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      '301', 'SYD', 70, fakeContextualProfile('301', 'SYD'),
    ));

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    expect(artifact!.scorers).toHaveLength(0);
    expect(artifact!.captains).toHaveLength(0);
  });

  it('excludes scorer/captain candidates not named in the round team list', async () => {
    // BRI vs MEL; team rankings include Alice and Bob, but only Alice is
    // named in the team list. Bob must not appear in scorers or captains.
    const match = fakeMatch('BRI', 'MEL', 'Suncorp Stadium');
    const matchRepo = new StubMatchRepo([match]);
    const playerRepo = new StubPlayerRepo([
      fakeSummary('101', 'BRI', 'Alice Smith'),
      fakeSummary('102', 'BRI', 'Bob Jones'),
    ]);
    const suppRepo = new StubSuppRepo([]);
    const teamListRepo = new StubTeamListRepo([
      fakeTeamList(match.id, 'BRI', [
        { playerId: '101', playerName: 'Alice Smith' },
      ]),
      fakeTeamList(match.id, 'MEL', []),
    ]);

    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('BRI', 'composite', [
      { playerId: '101', compositeScore: 90 },
      { playerId: '102', compositeScore: 80 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('BRI', 'captaincy', [
      { playerId: '101', compositeScore: 90 },
      { playerId: '102', compositeScore: 80 },
    ]));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      '101', 'BRI', 60, fakeContextualProfile('101', 'BRI', { MEL: 1.0 }),
    ));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      '102', 'BRI', 55, fakeContextualProfile('102', 'BRI', { MEL: 1.0 }),
    ));

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    const scorerIds = artifact!.scorers.map(s => s.playerId);
    const captainIds = artifact!.captains.map(s => s.playerId);
    expect(scorerIds).toContain('101');
    expect(scorerIds).not.toContain('102');
    expect(captainIds).toContain('101');
    expect(captainIds).not.toContain('102');
  });

  it('resolves break-even rows when supp stats use "Last, First" and team list uses "First Last"', async () => {
    // Regression: the supplementary stats source emits names like
    // "Isaako, Jamayne" while team lists store "Jamayne Isaako". The
    // normaliser must bridge both formats; without it every break-even row
    // gets dropped as un-named.
    const match = fakeMatch('DOL', 'BRI', 'Suncorp Stadium');
    const matchRepo = new StubMatchRepo([match]);
    const playerRepo = new StubPlayerRepo([]);
    const suppRepo = new StubSuppRepo([
      suppRow('Isaako, Jamayne', 'DOL', 155, 827200),
      suppRow('Riki, Jordan', 'BRI', 80, 500000),
    ]);
    const teamListRepo = new StubTeamListRepo([
      fakeTeamList(match.id, 'DOL', [
        { playerId: '900001', playerName: 'Jamayne Isaako' },
      ]),
      fakeTeamList(match.id, 'BRI', [
        { playerId: '900002', playerName: 'Jordan Riki' },
      ]),
    ]);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    expect(artifact!.breakEvens.top).toHaveLength(2);
    // Top row preserves the original supp name, but the playerId resolves
    // through the team list.
    expect(artifact!.breakEvens.top[0]).toMatchObject({
      playerName: 'Isaako, Jamayne',
      teamCode: 'DOL',
      playerId: '900001',
      breakEven: 155,
    });
    expect(artifact!.breakEvens.top[1]).toMatchObject({
      playerName: 'Riki, Jordan',
      teamCode: 'BRI',
      playerId: '900002',
    });
  });

  it('excludes break-even rows whose player is not named in the round team list', async () => {
    const match = fakeMatch('BRI', 'MEL', 'Suncorp Stadium');
    const matchRepo = new StubMatchRepo([match]);
    const playerRepo = new StubPlayerRepo([
      fakeSummary('101', 'BRI', 'Alice Smith'),
      fakeSummary('102', 'BRI', 'Bob Jones'),
    ]);
    const suppRepo = new StubSuppRepo([
      suppRow('Alice Smith', 'BRI', 100, 600000),
      suppRow('Bob Jones', 'BRI', -10, 200000),
    ]);
    const teamListRepo = new StubTeamListRepo([
      fakeTeamList(match.id, 'BRI', [
        { playerId: '101', playerName: 'Alice Smith' },
      ]),
      fakeTeamList(match.id, 'MEL', []),
    ]);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    const topNames = artifact!.breakEvens.top.map(r => r.playerName);
    const bottomNames = artifact!.breakEvens.bottom.map(r => r.playerName);
    expect(topNames).toContain('Alice Smith');
    expect(topNames).not.toContain('Bob Jones');
    expect(bottomNames).toContain('Alice Smith');
    expect(bottomNames).not.toContain('Bob Jones');
  });

  it('round 1 has no prior round, so break-even slices are empty', async () => {
    const matchRepo = new StubMatchRepo([fakeMatch('BRI', 'MEL', 'Suncorp Stadium')]);
    const playerRepo = new StubPlayerRepo([]);
    // Stub returns rows regardless of round — proves the use case skips
    // the call for round 1 rather than relying on the stub returning empty.
    const suppRepo = new StubSuppRepo([suppRow('Alice', 'BRI', 100)]);
    const teamListRepo = new StubTeamListRepo([]);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: 1, asOfRound: 0 });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, 1);
    expect(artifact!.breakEvens.top).toHaveLength(0);
    expect(artifact!.breakEvens.bottom).toHaveLength(0);
  });

  it('reads supplementary stats from round - 1 (the most recently published)', async () => {
    const match = fakeMatch('BRI', 'MEL', 'Suncorp Stadium');
    const matchRepo = new StubMatchRepo([match]);
    const playerRepo = new StubPlayerRepo([fakeSummary('101', 'BRI', 'Alice Smith')]);
    // Stub that records the round it was queried with.
    let queriedRound = -1;
    const suppRepo = {
      async findByRound(_year: number, round: number) {
        queriedRound = round;
        return [suppRow('Alice Smith', 'BRI', 42)];
      },
    };
    const teamListRepo = new StubTeamListRepo([
      fakeTeamList(match.id, 'BRI', [
        { playerId: '101', playerName: 'Alice Smith' },
      ]),
    ]);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: 5, asOfRound: AS_OF });

    expect(queriedRound).toBe(4);
  });

  it('caps each tile at 100 entries when the pool is larger', async () => {
    // 5 teams × 30 candidates = 150 contributing to each projection mode;
    // 150 supp rows for the break-even pool. All teams play each other in
    // a single round; bye exclusion shouldn't apply because every team
    // appears in `matchRepo`.
    const matches = [
      fakeMatch('BRI', 'MEL', 'Suncorp Stadium'),
      fakeMatch('SYD', 'STG', 'Allianz Stadium'),
      fakeMatch('PAR', 'PEN', 'CommBank Stadium'),
    ];
    const matchRepo = new StubMatchRepo(matches);
    const teamCodes = ['BRI', 'MEL', 'SYD', 'STG', 'PAR'];

    const summaries: PlayerSeasonSummary[] = [];
    const suppRows: SupplementaryPlayerStats[] = [];
    const teamLists: TeamList[] = [];

    for (let t = 0; t < teamCodes.length; t++) {
      const teamCode = teamCodes[t];
      const candidates: Array<{ playerId: string; compositeScore: number }> = [];
      const members: Array<{ playerId: string; playerName: string; jersey: number }> = [];
      for (let i = 0; i < 30; i++) {
        const pid = String((t + 1) * 1000 + i);
        const name = `${teamCode}Player${i}`;
        summaries.push(fakeSummary(pid, teamCode, name));
        suppRows.push(suppRow(name, teamCode, i * 10));
        candidates.push({ playerId: pid, compositeScore: 200 - i });
        members.push({ playerId: pid, playerName: name, jersey: i + 1 });
        await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
          pid, teamCode, 80 - i,
          fakeContextualProfile(pid, teamCode, { ANY: 1.0 }),
        ));
      }
      await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking(teamCode, 'composite', candidates));
      await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking(teamCode, 'captaincy', candidates));
      // Assign the team list to whichever match this team plays in.
      const match = matches.find(m => m.homeTeamCode === teamCode || m.awayTeamCode === teamCode);
      if (match) {
        teamLists.push(fakeTeamList(match.id, teamCode, members));
      }
    }
    const playerRepo = new StubPlayerRepo(summaries);
    const suppRepo = new StubSuppRepo(suppRows);
    const teamListRepo = new StubTeamListRepo(teamLists);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    expect(artifact!.breakEvens.top).toHaveLength(100);
    expect(artifact!.breakEvens.bottom).toHaveLength(100);
    expect(artifact!.scorers).toHaveLength(100);
    expect(artifact!.captains).toHaveLength(100);
    expect(artifact!.scorers[0].rank).toBe(1);
    expect(artifact!.scorers[99].rank).toBe(100);
  });
});
