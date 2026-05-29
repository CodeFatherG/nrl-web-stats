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
    const matchRepo = new StubMatchRepo([fakeMatch('BRI', 'MEL', 'Suncorp Stadium')]);
    const summaries = [
      fakeSummary('bri-1', 'BRI', 'Alice Smith'),
      fakeSummary('bri-2', 'BRI', 'Bob Jones'),
      fakeSummary('mel-1', 'MEL', 'Cam Brown'),
    ];
    const playerRepo = new StubPlayerRepo(summaries);
    const suppRepo = new StubSuppRepo([
      suppRow('Alice Smith', 'BRI', 100, 600000),
      suppRow('Bob Jones', 'BRI', -10, 200000),
      suppRow('Cam Brown', 'MEL', 50, 400000),
      suppRow('Dan Null', 'MEL', null, 300000), // filtered out
    ]);

    // Seed team rankings for both modes
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('BRI', 'composite', [
      { playerId: 'bri-1', compositeScore: 90 },
      { playerId: 'bri-2', compositeScore: 80 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('MEL', 'composite', [
      { playerId: 'mel-1', compositeScore: 85 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('BRI', 'captaincy', [
      { playerId: 'bri-1', compositeScore: 110 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('MEL', 'captaincy', [
      { playerId: 'mel-1', compositeScore: 105 },
    ]));

    // Seed player aggregates with contextual profiles. Alice gets +20% vs MEL,
    // Bob no adjustment, Cam +10% vs BRI + venue.
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      'bri-1', 'BRI', 60,
      fakeContextualProfile('bri-1', 'BRI', { MEL: 1.2 }, { suncorp: 1.05 }),
    ));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      'bri-2', 'BRI', 50,
      fakeContextualProfile('bri-2', 'BRI'),
    ));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      'mel-1', 'MEL', 55,
      fakeContextualProfile('mel-1', 'MEL', { BRI: 1.1 }, { suncorp: 1.0 }),
    ));

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    expect(artifact).not.toBeNull();
    expect(artifact!.asOfRound).toBe(AS_OF);

    // Break-evens: top sorted desc, bottom sorted asc. Null break_even filtered.
    expect(artifact!.breakEvens.top[0]).toMatchObject({ playerName: 'Alice Smith', breakEven: 100 });
    expect(artifact!.breakEvens.bottom[0]).toMatchObject({ playerName: 'Bob Jones', breakEven: -10 });
    // playerId resolved from season summary
    expect(artifact!.breakEvens.top[0].playerId).toBe('bri-1');

    // Scorers: Alice's adjusted = 60 * 1.2 * 1.05 = 75.6 (top); Cam = 55 * 1.1 * 1.0 = 60.5; Bob = 50.
    expect(artifact!.scorers[0].playerId).toBe('bri-1');
    expect(artifact!.scorers[0].adjustedTotal).toBeCloseTo(75.6);
    expect(artifact!.scorers[0].opponent).toBe('MEL');
    expect(artifact!.scorers[0].venue).toBe('suncorp');
    expect(artifact!.scorers[1].playerId).toBe('mel-1');

    // Captains: Alice still tops via base 60 * 1.2 * 1.05; Cam second.
    expect(artifact!.captains[0].playerId).toBe('bri-1');
    expect(artifact!.captains).toHaveLength(2);
  });

  it('skips candidates whose team is on bye (no fixture in round)', async () => {
    const matchRepo = new StubMatchRepo([fakeMatch('BRI', 'MEL', 'Suncorp Stadium')]);
    const playerRepo = new StubPlayerRepo([fakeSummary('syd-1', 'SYD', 'Syd Player')]);
    const suppRepo = new StubSuppRepo([]);

    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('SYD', 'composite', [
      { playerId: 'syd-1', compositeScore: 90 },
    ]));
    await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking('SYD', 'captaincy', [
      { playerId: 'syd-1', compositeScore: 90 },
    ]));
    await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
      'syd-1', 'SYD', 70, fakeContextualProfile('syd-1', 'SYD'),
    ));

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
    });

    await uc.execute({ year: YEAR, round: ROUND, asOfRound: AS_OF });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, ROUND);
    expect(artifact!.scorers).toHaveLength(0);
    expect(artifact!.captains).toHaveLength(0);
  });

  it('round 1 has no prior round, so break-even slices are empty', async () => {
    const matchRepo = new StubMatchRepo([fakeMatch('BRI', 'MEL', 'Suncorp Stadium')]);
    const playerRepo = new StubPlayerRepo([]);
    // Stub returns rows regardless of round — proves the use case skips
    // the call for round 1 rather than relying on the stub returning empty.
    const suppRepo = new StubSuppRepo([suppRow('Alice', 'BRI', 100)]);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
    });

    await uc.execute({ year: YEAR, round: 1, asOfRound: 0 });

    const artifact = await leagueRepo.findByYearAndRound(YEAR, 1);
    expect(artifact!.breakEvens.top).toHaveLength(0);
    expect(artifact!.breakEvens.bottom).toHaveLength(0);
  });

  it('reads supplementary stats from round - 1 (the most recently published)', async () => {
    const matchRepo = new StubMatchRepo([fakeMatch('BRI', 'MEL', 'Suncorp Stadium')]);
    const playerRepo = new StubPlayerRepo([fakeSummary('bri-1', 'BRI', 'Alice Smith')]);
    // Stub that records the round it was queried with.
    let queriedRound = -1;
    const suppRepo = {
      async findByRound(_year: number, round: number) {
        queriedRound = round;
        return [suppRow('Alice Smith', 'BRI', 42)];
      },
    };

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
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

    for (const teamCode of teamCodes) {
      const candidates: Array<{ playerId: string; compositeScore: number }> = [];
      for (let i = 0; i < 30; i++) {
        const pid = `${teamCode}-${i}`;
        const name = `${teamCode}Player${i}`;
        summaries.push(fakeSummary(pid, teamCode, name));
        suppRows.push(suppRow(name, teamCode, i * 10));
        candidates.push({ playerId: pid, compositeScore: 200 - i });
        await projectionRepo.savePlayerAggregate(fakePlayerAggregate(
          pid, teamCode, 80 - i,
          fakeContextualProfile(pid, teamCode, { ANY: 1.0 }),
        ));
      }
      await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking(teamCode, 'composite', candidates));
      await projectionRepo.saveTeamRankingsAggregate(fakeTeamRanking(teamCode, 'captaincy', candidates));
    }
    const playerRepo = new StubPlayerRepo(summaries);
    const suppRepo = new StubSuppRepo(suppRows);

    const uc = new PrecomputeLeagueRoundProjectionsUseCase({
      leagueRoundProjectionsRepository: leagueRepo,
      projectionRepository: projectionRepo,
      matchRepository: matchRepo,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
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
