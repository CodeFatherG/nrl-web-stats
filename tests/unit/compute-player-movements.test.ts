import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ComputePlayerMovementsUseCase } from '../../src/application/use-cases/compute-player-movements.js';
import { InMemoryPlayerMovementsRepository } from '../../src/infrastructure/persistence/in-memory-player-movements-repository.js';
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
  let cache: InMemoryPlayerMovementsRepository;
  let teamListRepo: InMemoryTeamListRepo;
  let matchRepo: InMemoryMatchRepo;
  let cwRepo: InMemoryCasualtyWardRepo;
  let useCase: ComputePlayerMovementsUseCase;

  beforeEach(() => {
    cache = new InMemoryPlayerMovementsRepository();
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
    expect(await cache.findByYearAndRound(2025, 10)).not.toBeNull();
  });

  it('artifact is written (not null) after successful run', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10);
    expect(result).not.toBeNull();
  });

  // Injured: Billy Smith (BRO #9) absent from round 10, open CW entry
  it('classifies Billy Smith as injured with injury details', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
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
    const result = await cache.findByYearAndRound(2025, 10)!;
    const nicho = result.dropped.find(r => r.playerName === 'Nicho Hynes');
    expect(nicho).toBeDefined();
    expect(nicho!.lastJersey).toBe(7);
  });

  // Billy Smith must NOT appear in dropped
  it('does not classify Billy Smith as dropped', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    expect(result.dropped.find(r => r.playerName === 'Billy Smith')).toBeUndefined();
  });

  // Benched: Jordan Riki (BRO) was #13 in round 9, now #18 in round 10
  it('classifies Jordan Riki as benched with prevJersey and consecutiveRoundsBenched', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    const riki = result.benched.find(r => r.playerName === 'Jordan Riki');
    expect(riki).toBeDefined();
    expect(riki!.prevJersey).toBe(13);
    expect(riki!.currentJersey).toBe(14);
    expect(riki!.currentPosition).toBe('Interchange');
    expect(riki!.consecutiveRoundsBenched).toBe(1);
    expect(riki!.replacedByPlayerId).toBe(104); // Kobe Hetherington took the Lock slot
  });

  // Promoted: Kobe Hetherington (BRO) was #18 in round 9, now #13 in round 10, replacing Jordan Riki
  it('classifies Kobe Hetherington as promoted with replacingPlayerId set', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    const kobe = result.promoted.find(r => r.playerName === 'Kobe Hetherington');
    expect(kobe).toBeDefined();
    expect(kobe!.currentJersey).toBe(13);
    expect(kobe!.replacingPlayerId).toBe(103); // Jordan Riki moved from Lock to Interchange
    expect(kobe!.replacingPlayerName).toBe('Jordan Riki');
  });

  // Covering Injury: Cory Paix (BRO) fills #9 vacated by injured Billy Smith
  it('classifies Cory Paix as covering Billy Smith\'s injury', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
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
    const result = await cache.findByYearAndRound(2025, 10)!;
    expect(result.promoted.find(r => r.playerName === 'Cory Paix')).toBeUndefined();
  });

  // Position Changed: Jackson Hastings (NEW) #6 Halfback → Five-Eighth (starting position, both ≤ 13)
  it('classifies Jackson Hastings as position changed', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    const hastings = result.positionChanged.find(r => r.playerName === 'Jackson Hastings');
    expect(hastings).toBeDefined();
    expect(hastings!.oldPosition).toBe('Halfback');
    expect(hastings!.newPosition).toBe('Five-Eighth');
    expect(hastings!.currentJersey).toBe(6);
  });

  // Promoted to slot vacated by a player who changed positions (not absent/benched)
  it('classifies David Smith as promoted replacing Jackson Hastings who moved position', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    const david = result.promoted.find(r => r.playerName === 'David Smith');
    expect(david).toBeDefined();
    expect(david!.position).toBe('Halfback');
    expect(david!.replacingPlayerId).toBe(202); // Jackson Hastings vacated Halfback by moving to Five-Eighth
    expect(david!.replacingPlayerName).toBe('Jackson Hastings');
  });

  // Interchange position change is NOT reported
  it('does not classify Jack Cogger (interchange) as position changed', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    expect(result.positionChanged.find(r => r.playerName === 'Jack Cogger')).toBeUndefined();
  });

  // Same-position players NOT in positionChanged
  it('does not classify unchanged players as position changed', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    const reece = result.positionChanged.find(r => r.playerName === 'Reece Walsh');
    expect(reece).toBeUndefined();
  });

  // Returning from Injury: Valentine Holmes (NQC) closed CW entry, in round 10 starters
  it('classifies Valentine Holmes as returning from injury', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
    const holmes = result.returningFromInjury.find(r => r.playerName === 'Valentine Holmes');
    expect(holmes).toBeDefined();
    expect(holmes!.currentJersey).toBe(3);
  });

  // Holmes must NOT appear in promoted — returningFromInjury takes priority
  it('does not classify Valentine Holmes as promoted', async () => {
    await useCase.execute(2025, 10);
    const result = await cache.findByYearAndRound(2025, 10)!;
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
    expect(await cache.findByYearAndRound(2025, 10)).toBeNull();
  });

  // Round 1 edge case: noPreviousRound
  it('sets noPreviousRound: true for round 1 with all team lists present', async () => {
    const round1Lists = currTeamLists.map(tl => ({ ...tl, round: 1, matchId: tl.matchId.replace('R10', 'R1') }));
    const round1Matches = currMatches.map(m => ({ ...m, round: 1, id: m.id.replace('R10', 'R1'), scheduledTime: '2025-03-10T10:00:00.000Z' }));
    const r1TeamRepo = new InMemoryTeamListRepo([{ round: 1, lists: round1Lists as TeamList[] }]);
    const r1MatchRepo = new InMemoryMatchRepo([{ round: 1, matches: round1Matches }]);
    const r1UseCase = new ComputePlayerMovementsUseCase(r1TeamRepo, r1MatchRepo, cwRepo, cache);
    await r1UseCase.execute(2025, 1);
    const result = await cache.findByYearAndRound(2025, 1);
    expect(result).not.toBeNull();
    expect(result!.noPreviousRound).toBe(true);
    expect(result!.dropped).toHaveLength(0);
    expect(result!.benched).toHaveLength(0);
  });
});

// ─── Multi-slot position pairing tests ───────────────────────────────────────
// These use programmatic fixtures to isolate the two-players-same-position edge cases.

function makeMinimalMatch(id: string, round: number, home: string, away: string): Match {
  return {
    id, year: 2025, round, homeTeamCode: home, awayTeamCode: away,
    homeStrengthRating: null, awayStrengthRating: null,
    homeScore: null, awayScore: null, status: 'Scheduled' as const,
    scheduledTime: '2025-04-21T10:00:00.000Z', stadium: null, weather: null,
  };
}

describe('ComputePlayerMovementsUseCase — multi-slot position pairing', () => {
  // OPP team: one unchanged fullback — present in both rounds to satisfy expected-teams check
  const oppPrev = { matchId: '2025-R10-TST-OPP', teamCode: 'OPP', year: 2025, round: 9,  scrapedAt: '', members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }] };
  const oppCurr = { matchId: '2025-R10-TST-OPP', teamCode: 'OPP', year: 2025, round: 10, scrapedAt: '', members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }] };
  const testMatches9  = [makeMinimalMatch('2025-R10-TST-OPP', 9,  'TST', 'OPP')];
  const testMatches10 = [makeMinimalMatch('2025-R10-TST-OPP', 10, 'TST', 'OPP')];

  // Test A: both wings injured — each replacement covers exactly one injury
  it('pairs each replacement wing 1-to-1 with its own injury (not both to the first)', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [
        { playerId: 2001, jerseyNumber: 2, playerName: 'Wing A', position: 'Wing' },
        { playerId: 2002, jerseyNumber: 5, playerName: 'Wing B', position: 'Wing' },
        { playerId: 2003, jerseyNumber: 19, playerName: 'Bench W1', position: 'Reserve' },
        { playerId: 2004, jerseyNumber: 20, playerName: 'Bench W2', position: 'Reserve' },
      ],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [
        { playerId: 2003, jerseyNumber: 2,  playerName: 'Bench W1', position: 'Wing' },
        { playerId: 2004, jerseyNumber: 5,  playerName: 'Bench W2', position: 'Wing' },
      ],
    };
    const openCW: CasualtyWardEntry[] = [
      { id: 1, playerId: '2001', playerName: 'Wing A', teamCode: 'TST', injury: 'Hamstring', expectedReturn: 'Round 12', reportedDate: '2025-04-14', closedDate: null },
      { id: 2, playerId: '2002', playerName: 'Wing B', teamCode: 'TST', injury: 'Knee',      expectedReturn: 'Round 13', reportedDate: '2025-04-14', closedDate: null },
    ];

    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    const cwRepo2 = new InMemoryCasualtyWardRepo(openCW, []);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, cwRepo2, cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;

    // Sorted by playerId: 2001 < 2002 (injuries), 2003 < 2004 (movers) → 2003→2001, 2004→2002
    const w1 = result.coveringInjury.find(r => r.playerId === 2003);
    const w2 = result.coveringInjury.find(r => r.playerId === 2004);
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();
    expect(w1!.coveringPlayerId).toBe(2001);
    expect(w2!.coveringPlayerId).toBe(2002);
  });

  // Test B: both wings dropped — each promoted player replaces exactly one
  it('pairs each promoted wing with its own dropped predecessor (not both with the same)', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [
        { playerId: 3001, jerseyNumber: 2, playerName: 'Wing C', position: 'Wing' },
        { playerId: 3002, jerseyNumber: 5, playerName: 'Wing D', position: 'Wing' },
        { playerId: 3003, jerseyNumber: 19, playerName: 'Sub W1', position: 'Reserve' },
        { playerId: 3004, jerseyNumber: 20, playerName: 'Sub W2', position: 'Reserve' },
      ],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [
        { playerId: 3003, jerseyNumber: 2, playerName: 'Sub W1', position: 'Wing' },
        { playerId: 3004, jerseyNumber: 5, playerName: 'Sub W2', position: 'Wing' },
      ],
    };

    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    const cwRepo2 = new InMemoryCasualtyWardRepo([], []);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, cwRepo2, cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;

    // Sorted by playerId: 3001 < 3002 (prev wings), 3003 < 3004 (new wings) → 3003 replaces 3001, 3004 replaces 3002
    const p1 = result.promoted.find(r => r.playerId === 3003);
    const p2 = result.promoted.find(r => r.playerId === 3004);
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p1!.replacingPlayerId).toBe(3001);
    expect(p2!.replacingPlayerId).toBe(3002);
  });

  // Test D: one prop stays (incumbent), one prop is benched, one interchange player promoted to prop.
  // The incumbent must not distort the slot pairing for the benched/promoted players.
  it('pairs benched prop with the new-arrival prop, ignoring the incumbent prop', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [
        { playerId: 5501, jerseyNumber: 8,  playerName: 'Prop Stay',   position: 'Prop' },       // incumbent
        { playerId: 5502, jerseyNumber: 10, playerName: 'Prop Out',    position: 'Prop' },       // will be benched
        { playerId: 5503, jerseyNumber: 14, playerName: 'Int Player',  position: 'Interchange' }, // will be promoted
      ],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [
        { playerId: 5501, jerseyNumber: 8,  playerName: 'Prop Stay',   position: 'Prop' },       // still starting
        { playerId: 5503, jerseyNumber: 10, playerName: 'Int Player',  position: 'Prop' },       // promoted
        { playerId: 5502, jerseyNumber: 14, playerName: 'Prop Out',    position: 'Interchange' }, // benched
      ],
    };
    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, new InMemoryCasualtyWardRepo([], []), cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;

    // Prop Out benched: vacated=[PropOut], arrivals=[IntPlayer] → replacedBy=IntPlayer
    const benched = result.benched.find(r => r.playerId === 5502);
    expect(benched).toBeDefined();
    expect(benched!.replacedByPlayerId).toBe(5503);

    // Int Player promoted: arrivals=[IntPlayer], vacated=[PropOut] → replacing=PropOut
    const promoted = result.promoted.find(r => r.playerId === 5503);
    expect(promoted).toBeDefined();
    expect(promoted!.replacingPlayerId).toBe(5502);

    // Prop Stay is silently unchanged (no classification)
    expect(result.benched.find(r => r.playerId === 5501)).toBeUndefined();
    expect(result.promoted.find(r => r.playerId === 5501)).toBeUndefined();
  });

  // Test C: both wings benched (starter → Interchange) — each gets distinct replacedByPlayerId
  it('assigns distinct replacedByPlayerId to each benched wing via slot-index pairing', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [
        { playerId: 4001, jerseyNumber: 2, playerName: 'Wing E', position: 'Wing' },
        { playerId: 4002, jerseyNumber: 5, playerName: 'Wing F', position: 'Wing' },
        { playerId: 4003, jerseyNumber: 19, playerName: 'Res W1', position: 'Reserve' },
        { playerId: 4004, jerseyNumber: 20, playerName: 'Res W2', position: 'Reserve' },
      ],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [
        { playerId: 4001, jerseyNumber: 14, playerName: 'Wing E', position: 'Interchange' },
        { playerId: 4002, jerseyNumber: 15, playerName: 'Wing F', position: 'Interchange' },
        { playerId: 4003, jerseyNumber: 2,  playerName: 'Res W1', position: 'Wing' },
        { playerId: 4004, jerseyNumber: 5,  playerName: 'Res W2', position: 'Wing' },
      ],
    };

    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    const cwRepo2 = new InMemoryCasualtyWardRepo([], []);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, cwRepo2, cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;

    // Sorted by playerId: prev[0]=4001, prev[1]=4002; curr[0]=4003, curr[1]=4004
    // → 4001 (slot 0) replaced by 4003; 4002 (slot 1) replaced by 4004
    const b1 = result.benched.find(r => r.playerId === 4001);
    const b2 = result.benched.find(r => r.playerId === 4002);
    expect(b1).toBeDefined();
    expect(b2).toBeDefined();
    expect(b1!.replacedByPlayerId).toBe(4003);
    expect(b2!.replacedByPlayerId).toBe(4004);
  });
});

// ─── Phase 1 extension: Reserve players now classified (not silently ignored) ─────────────────

describe('ComputePlayerMovementsUseCase — Phase 1 Reserve extension', () => {
  const oppPrev = { matchId: '2025-R10-TST-OPP', teamCode: 'OPP', year: 2025, round: 9,  scrapedAt: '', members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }] };
  const oppCurr = { matchId: '2025-R10-TST-OPP', teamCode: 'OPP', year: 2025, round: 10, scrapedAt: '', members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }] };
  const testMatches9  = [{ id: '2025-R10-TST-OPP', year: 2025, round: 9,  homeTeamCode: 'TST', awayTeamCode: 'OPP', homeStrengthRating: null, awayStrengthRating: null, homeScore: null, awayScore: null, status: 'Scheduled' as const, scheduledTime: '2025-04-14T10:00:00.000Z', stadium: null, weather: null }];
  const testMatches10 = [{ id: '2025-R10-TST-OPP', year: 2025, round: 10, homeTeamCode: 'TST', awayTeamCode: 'OPP', homeStrengthRating: null, awayStrengthRating: null, homeScore: null, awayScore: null, status: 'Scheduled' as const, scheduledTime: '2025-04-21T10:00:00.000Z', stadium: null, weather: null }];

  // starter → Reserve, no CW → Dropped (not Benched)
  it('classifies starter→Reserve (no CW) as dropped, not benched', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [{ playerId: 5001, jerseyNumber: 10, playerName: 'Prop X', position: 'Prop' }],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [{ playerId: 5001, jerseyNumber: 18, playerName: 'Prop X', position: 'Reserve' }],
    };
    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, new InMemoryCasualtyWardRepo([], []), cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;
    expect(result.dropped.find(r => r.playerId === 5001)).toBeDefined();
    expect(result.benched.find(r => r.playerId === 5001)).toBeUndefined();
  });

  // starter → Reserve, open CW → Injured (not Benched)
  it('classifies starter→Reserve with open CW as injured, not benched', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [{ playerId: 5002, jerseyNumber: 10, playerName: 'Prop Y', position: 'Prop' }],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [{ playerId: 5002, jerseyNumber: 18, playerName: 'Prop Y', position: 'Reserve' }],
    };
    const openCW: CasualtyWardEntry[] = [
      { id: 10, playerId: '5002', playerName: 'Prop Y', teamCode: 'TST', injury: 'Knee', expectedReturn: 'Round 12', reportedDate: '2025-04-14', closedDate: null },
    ];
    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, new InMemoryCasualtyWardRepo(openCW, []), cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;
    expect(result.injured.find(r => r.playerId === 5002)).toBeDefined();
    expect(result.benched.find(r => r.playerId === 5002)).toBeUndefined();
  });

  // Interchange → Reserve, no CW → Dropped (was silently ignored)
  it('classifies interchange→Reserve (no CW) as dropped', async () => {
    const prevTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
      members: [
        { playerId: 5003, jerseyNumber: 14, playerName: 'Int Player', position: 'Interchange' },
        { playerId: 9998, jerseyNumber: 1,  playerName: 'TST FB',     position: 'Fullback' },
      ],
    };
    const currTST = {
      matchId: '2025-R10-TST-OPP', teamCode: 'TST', year: 2025, round: 10, scrapedAt: '',
      members: [
        { playerId: 5003, jerseyNumber: 18, playerName: 'Int Player', position: 'Reserve' },
        { playerId: 9998, jerseyNumber: 1,  playerName: 'TST FB',     position: 'Fullback' },
      ],
    };
    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([{ round: 9, lists: [prevTST, oppPrev] as TeamList[] }, { round: 10, lists: [currTST, oppCurr] as TeamList[] }]);
    const mRepo = new InMemoryMatchRepo([{ round: 9, matches: testMatches9 }, { round: 10, matches: testMatches10 }]);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, new InMemoryCasualtyWardRepo([], []), cache2).execute(2025, 10);
    const result = await cache2.findByYearAndRound(2025, 10)!;
    expect(result.dropped.find(r => r.playerId === 5003)).toBeDefined();
  });
});

// ─── Bye-round handling ───────────────────────────────────────────────────────
// When a team had a bye in round N-1, their prevByTeam entry must fall back to
// round N-2 (the last round they played) rather than being undefined.

describe('ComputePlayerMovementsUseCase — bye-round handling', () => {
  // Round 9: TST played (Jackson Ford #13 Lock, James Replacement #14 Interchange)
  // Round 10: TST on bye — no team list, no match
  // Round 11: TST plays again (Ford now #14 Interchange, Replacement now #13 Lock)
  // Expected: Ford → Benched, Replacement → Promoted replacing Ford

  const tst9: TeamList = {
    matchId: '2025-R9-TST-OPP', teamCode: 'TST', year: 2025, round: 9, scrapedAt: '',
    members: [
      { playerId: 6001, jerseyNumber: 13, playerName: 'Jackson Ford',      position: 'Lock' },
      { playerId: 6002, jerseyNumber: 14, playerName: 'James Replacement', position: 'Interchange' },
    ],
  };
  const opp9: TeamList = {
    matchId: '2025-R9-TST-OPP', teamCode: 'OPP', year: 2025, round: 9, scrapedAt: '',
    members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }],
  };
  // Round 10: OPP plays, TST is on bye (no TST entry)
  const opp10: TeamList = {
    matchId: '2025-R10-OPP-OPP2', teamCode: 'OPP', year: 2025, round: 10, scrapedAt: '',
    members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }],
  };
  const tst11: TeamList = {
    matchId: '2025-R11-TST-OPP', teamCode: 'TST', year: 2025, round: 11, scrapedAt: '',
    members: [
      { playerId: 6001, jerseyNumber: 14, playerName: 'Jackson Ford',      position: 'Interchange' },
      { playerId: 6002, jerseyNumber: 13, playerName: 'James Replacement', position: 'Lock' },
    ],
  };
  const opp11: TeamList = {
    matchId: '2025-R11-TST-OPP', teamCode: 'OPP', year: 2025, round: 11, scrapedAt: '',
    members: [{ playerId: 9999, jerseyNumber: 1, playerName: 'Opp FB', position: 'Fullback' }],
  };

  const match10 = makeMinimalMatch('2025-R10-OPP-OPP2', 10, 'OPP', 'OPP2'); // TST on bye
  const match11 = makeMinimalMatch('2025-R11-TST-OPP',  11, 'TST', 'OPP');

  let byeResult: Awaited<ReturnType<InMemoryPlayerMovementsRepository['findByYearAndRound']>>;

  beforeEach(async () => {
    const cache2 = new InMemoryPlayerMovementsRepository();
    const tRepo = new InMemoryTeamListRepo([
      { round: 9,  lists: [tst9, opp9] as TeamList[] },
      { round: 10, lists: [opp10] as TeamList[] },       // TST absent — bye
      { round: 11, lists: [tst11, opp11] as TeamList[] },
    ]);
    const mRepo = new InMemoryMatchRepo([
      { round: 10, matches: [match10] },
      { round: 11, matches: [match11] },
    ]);
    await new ComputePlayerMovementsUseCase(tRepo, mRepo, new InMemoryCasualtyWardRepo([], []), cache2).execute(2025, 11);
    byeResult = await cache2.findByYearAndRound(2025, 11);
  });

  it('produces a result for a team returning from a bye', () => {
    expect(byeResult).not.toBeNull();
  });

  it('classifies a starter as benched when their team had a bye the previous round', () => {
    const ford = byeResult!.benched.find(r => r.playerId === 6001);
    expect(ford).toBeDefined();
    expect(ford!.prevPosition).toBe('Lock');
    expect(ford!.currentPosition).toBe('Interchange');
  });

  it('classifies an interchange player as promoted when their team had a bye the previous round', () => {
    const replacement = byeResult!.promoted.find(r => r.playerId === 6002);
    expect(replacement).toBeDefined();
    expect(replacement!.position).toBe('Lock');
    expect(replacement!.replacingPlayerId).toBe(6001);
  });
});
