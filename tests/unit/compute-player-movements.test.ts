import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ComputePlayerMovementsUseCase } from '../../src/application/use-cases/compute-player-movements.js';
import { PlayerMovementsCache } from '../../src/analytics/player-movements-cache.js';
import type { TeamListRepository } from '../../src/domain/repositories/team-list-repository.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { CasualtyWardRepository } from '../../src/domain/repositories/casualty-ward-repository.js';
import type { TeamList } from '../../src/domain/team-list.js';
import type { Match } from '../../src/domain/match.js';
import type { CasualtyWardEntry } from '../../src/domain/casualty-ward-entry.js';

// ─── Load fixtures ────────────────────────────────────────────────────────────

const fixturesDir = path.join(__dirname, '../fixtures/movements');

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8')) as T;
}

const prevTeamLists = loadJson<TeamList[]>('team-lists-round-prev.json');
const currTeamLists = loadJson<TeamList[]>('team-lists-round-curr.json');
const openEntries = loadJson<CasualtyWardEntry[]>('casualty-ward-open.json');
const closedEntries = loadJson<CasualtyWardEntry[]>('casualty-ward-closed.json');

// ─── Derive match data from fixtures ─────────────────────────────────────────

function matchesFromTeamLists(year: number, round: number, teamLists: TeamList[]): Match[] {
  const matchIds = [...new Set(teamLists.map(tl => tl.matchId))];
  return matchIds.map(id => {
    const parts = id.split('-');
    const homeCode = parts[2] ?? null;
    const awayCode = parts[3] ?? null;
    return {
      id,
      year,
      round,
      homeTeamCode: homeCode,
      awayTeamCode: awayCode,
      homeStrengthRating: null,
      awayStrengthRating: null,
      homeScore: null,
      awayScore: null,
      status: 'Scheduled' as const,
      scheduledTime: round === 9 ? `${year}-04-14T10:00:00.000Z` : `${year}-04-21T10:00:00.000Z`,
      stadium: null,
      weather: null,
    };
  });
}



const prevMatches = matchesFromTeamLists(2025, 9, prevTeamLists);
const currMatches = matchesFromTeamLists(2025, 10, currTeamLists);

// ─── In-memory stubs ──────────────────────────────────────────────────────────

class InMemoryTeamListRepo implements TeamListRepository {
  private readonly byRound = new Map<number, TeamList[]>();

  constructor(rounds: { round: number; lists: TeamList[] }[]) {
    for (const { round, lists } of rounds) {
      this.byRound.set(round, lists);
    }
  }

  async findByYearAndRound(_year: number, round: number): Promise<TeamList[]> {
    return this.byRound.get(round) ?? [];
  }

  async save(_tl: TeamList): Promise<void> { /* no-op */ }
  async saveAll(_tls: TeamList[]): Promise<void> { /* no-op */ }
  async findByMatch(_matchId: string): Promise<TeamList[]> { return []; }
  async hasTeamList(_matchId: string, _teamCode: string): Promise<boolean> { return false; }
  async hasTeamListsForMatch(_matchId: string): Promise<boolean> { return false; }
}

class InMemoryMatchRepo implements MatchRepository {
  private readonly byRound = new Map<number, Match[]>();

  constructor(rounds: { round: number; matches: Match[] }[]) {
    for (const { round, matches } of rounds) {
      this.byRound.set(round, matches);
    }
  }

  async findByYearAndRound(_year: number, round: number): Promise<Match[]> {
    return this.byRound.get(round) ?? [];
  }

  async save(_m: Match): Promise<void> { /* no-op */ }
  async saveAll(_ms: Match[]): Promise<void> { /* no-op */ }
  async findByTeam(_code: string, _year?: number): Promise<Match[]> { return []; }
  async findById(_id: string): Promise<Match | null> { return null; }
  async findByYear(_year: number): Promise<Match[]> { return []; }
  async getLoadedYears(): Promise<number[]> { return [2025]; }
  async isYearLoaded(_year: number): Promise<boolean> { return true; }
  async getMatchCount(): Promise<number> { return 0; }
}

class InMemoryCasualtyWardRepo implements CasualtyWardRepository {
  constructor(
    private readonly open: CasualtyWardEntry[],
    private readonly closed: CasualtyWardEntry[]
  ) {}

  async findOpen(): Promise<CasualtyWardEntry[]> { return this.open; }
  async findRecentlyClosed(_sinceDate: string): Promise<CasualtyWardEntry[]> { return this.closed; }

  async insert(e: CasualtyWardEntry): Promise<CasualtyWardEntry> { return e; }
  async update(_e: CasualtyWardEntry): Promise<void> { /* no-op */ }
  async findByPlayerId(_id: string): Promise<CasualtyWardEntry[]> { return []; }
  async findAll(): Promise<CasualtyWardEntry[]> { return [...this.open, ...this.closed]; }
  async close(_id: number, _date: string): Promise<void> { /* no-op */ }
  async findRecentlyClosedByKey(_fn: string, _ln: string, _tc: string, _d: string): Promise<CasualtyWardEntry | null> { return null; }
  async reopen(_id: number): Promise<void> { /* no-op */ }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComputePlayerMovementsUseCase', () => {
  let cache: PlayerMovementsCache;
  let teamListRepo: InMemoryTeamListRepo;
  let matchRepo: InMemoryMatchRepo;
  let cwRepo: InMemoryCasualtyWardRepo;
  let useCase: ComputePlayerMovementsUseCase;

  beforeEach(() => {
    cache = new PlayerMovementsCache();
    teamListRepo = new InMemoryTeamListRepo([
      { round: 9, lists: prevTeamLists },
      { round: 10, lists: currTeamLists },
    ]);
    matchRepo = new InMemoryMatchRepo([
      { round: 9, matches: prevMatches },
      { round: 10, matches: currMatches },
    ]);
    cwRepo = new InMemoryCasualtyWardRepo(openEntries, closedEntries);
    useCase = new ComputePlayerMovementsUseCase(teamListRepo, matchRepo, cwRepo, cache);
  });

  it('stores result in cache after successful run', async () => {
    await useCase.execute(2025, 10);
    expect(cache.get(2025, 10)).not.toBeNull();
  });

  it('result has pending: false', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    expect(result.pending).toBe(false);
  });

  // Injured: Billy Smith (BRO #9) absent from round 10, open CW entry
  it('classifies Billy Smith as injured with injury details', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const billy = result.injured.find(r => r.playerName === 'Billy Smith');
    expect(billy).toBeDefined();
    expect(billy!.lastJersey).toBe(9);
    expect(billy!.lastPosition).toBe('Hooker');
    expect(billy!.injury).toBe('Hamstring');
    expect(billy!.expectedReturn).toBe('Round 12');
  });

  // Dropped: Nicho Hynes (SHA #7) absent from round 10, no open CW entry
  it('classifies Nicho Hynes as dropped (form)', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const nicho = result.dropped.find(r => r.playerName === 'Nicho Hynes');
    expect(nicho).toBeDefined();
    expect(nicho!.lastJersey).toBe(7);
  });

  // Billy Smith must NOT appear in dropped
  it('does not classify Billy Smith as dropped', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    expect(result.dropped.find(r => r.playerName === 'Billy Smith')).toBeUndefined();
  });

  // Benched: Jordan Riki (BRO) was #14 in round 9, now #18 in round 10
  it('classifies Jordan Riki as benched with prevJersey and consecutiveRoundsBenched', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const riki = result.benched.find(r => r.playerName === 'Jordan Riki');
    expect(riki).toBeDefined();
    expect(riki!.prevJersey).toBe(14);
    expect(riki!.currentJersey).toBe(18);
    expect(riki!.consecutiveRoundsBenched).toBe(1);
  });

  // Promoted: Kobe Hetherington (BRO) was #18 in round 9, now #13 in round 10 (not covering any injury)
  it('classifies Kobe Hetherington as promoted with replacingPlayerId null', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const kobe = result.promoted.find(r => r.playerName === 'Kobe Hetherington');
    expect(kobe).toBeDefined();
    expect(kobe!.currentJersey).toBe(13);
    expect(kobe!.replacingPlayerId).toBeNull(); // jersey #13 not held by a benched player last round
  });

  // Covering Injury: Cory Paix (BRO) fills #9 vacated by injured Billy Smith
  it('classifies Cory Paix as covering Billy Smith\'s injury', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const paix = result.coveringInjury.find(r => r.playerName === 'Cory Paix');
    expect(paix).toBeDefined();
    expect(paix!.currentJersey).toBe(9);
    expect(paix!.coveringPlayerName).toBe('Billy Smith');
    expect(paix!.coveringLastJersey).toBe(9);
    expect(paix!.prevJersey).toBeNull(); // was not in prev team
  });

  // Cory Paix must NOT appear in promoted
  it('does not classify Cory Paix as promoted', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    expect(result.promoted.find(r => r.playerName === 'Cory Paix')).toBeUndefined();
  });

  // Position Changed: Jack Cogger (NEW) #14 Halfback → Five-Eighth
  it('classifies Jack Cogger as position changed', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const cogger = result.positionChanged.find(r => r.playerName === 'Jack Cogger');
    expect(cogger).toBeDefined();
    expect(cogger!.oldPosition).toBe('Halfback');
    expect(cogger!.newPosition).toBe('Five-Eighth');
    expect(cogger!.currentJersey).toBe(14);
  });

  // Same-position players NOT in positionChanged
  it('does not classify unchanged players as position changed', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const reece = result.positionChanged.find(r => r.playerName === 'Reece Walsh');
    expect(reece).toBeUndefined();
  });

  // Returning from Injury: Valentine Holmes (NQC) closed CW entry, in round 10 starters
  it('classifies Valentine Holmes as returning from injury', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    const holmes = result.returningFromInjury.find(r => r.playerName === 'Valentine Holmes');
    expect(holmes).toBeDefined();
    expect(holmes!.currentJersey).toBe(3);
  });

  // Holmes must NOT appear in promoted — returningFromInjury takes priority
  it('does not classify Valentine Holmes as promoted', async () => {
    await useCase.execute(2025, 10);
    const result = cache.get(2025, 10)!;
    expect(result.promoted.find(r => r.playerName === 'Valentine Holmes')).toBeUndefined();
  });

  // Pending: missing teams → no cache write
  it('does not cache when not all teams have submitted lists', async () => {
    const partialRepo = new InMemoryTeamListRepo([
      { round: 9, lists: prevTeamLists },
      { round: 10, lists: currTeamLists.slice(0, 10) }, // only 10 of 16 teams
    ]);
    const partialUseCase = new ComputePlayerMovementsUseCase(partialRepo, matchRepo, cwRepo, cache);
    await partialUseCase.execute(2025, 10);
    expect(cache.get(2025, 10)).toBeNull();
  });

  // Round 1 edge case: noPreviousRound
  it('sets noPreviousRound: true for round 1 with all team lists present', async () => {
    const round1Lists = currTeamLists.map(tl => ({ ...tl, round: 1, matchId: tl.matchId.replace('R10', 'R1') }));
    const round1Matches = currMatches.map(m => ({ ...m, round: 1, id: m.id.replace('R10', 'R1'), scheduledTime: '2025-03-10T10:00:00.000Z' }));
    const r1TeamRepo = new InMemoryTeamListRepo([{ round: 1, lists: round1Lists as TeamList[] }]);
    const r1MatchRepo = new InMemoryMatchRepo([{ round: 1, matches: round1Matches }]);
    const r1UseCase = new ComputePlayerMovementsUseCase(r1TeamRepo, r1MatchRepo, cwRepo, cache);
    await r1UseCase.execute(2025, 1);
    const result = cache.get(2025, 1);
    expect(result).not.toBeNull();
    expect(result!.noPreviousRound).toBe(true);
    expect(result!.dropped).toHaveLength(0);
    expect(result!.benched).toHaveLength(0);
  });
});
