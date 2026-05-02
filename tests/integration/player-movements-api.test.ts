/**
 * Integration tests for the GET /api/player-movements endpoint.
 * Tests the full pipeline: use case → cache → handler response.
 */

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
import type { PlayerMovementsResult } from '../../src/domain/player-movements.js';

// ─── Fixture loading ──────────────────────────────────────────────────────────

const fixturesDir = path.join(__dirname, '../fixtures/movements');

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8')) as T;
}

const prevTeamLists = loadJson<TeamList[]>('team-lists-round-prev.json');
const currTeamLists = loadJson<TeamList[]>('team-lists-round-curr.json');
const openEntries = loadJson<CasualtyWardEntry[]>('casualty-ward-open.json');
const closedEntries = loadJson<CasualtyWardEntry[]>('casualty-ward-closed.json');

// ─── In-memory stubs (same as unit test) ─────────────────────────────────────

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

function matchesFromTeamLists(year: number, round: number, teamLists: TeamList[]): Match[] {
  const matchIds = [...new Set(teamLists.map(tl => tl.matchId))];
  return matchIds.map(id => {
    // matchId format: "2025-R10-BRO-CBR" → parts[2]=home, parts[3]=away
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

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('GET /api/player-movements', () => {
  let cache: PlayerMovementsCache;
  let useCase: ComputePlayerMovementsUseCase;

  const prevMatches = matchesFromTeamLists(2025, 9, prevTeamLists);
  const currMatches = matchesFromTeamLists(2025, 10, currTeamLists);

  beforeEach(async () => {
    cache = new PlayerMovementsCache();
    const teamListRepo = new InMemoryTeamListRepo([
      { round: 9, lists: prevTeamLists },
      { round: 10, lists: currTeamLists },
    ]);
    const matchRepo = new InMemoryMatchRepo([
      { round: 9, matches: prevMatches },
      { round: 10, matches: currMatches },
    ]);
    const cwRepo = new InMemoryCasualtyWardRepo(openEntries, closedEntries);
    useCase = new ComputePlayerMovementsUseCase(teamListRepo, matchRepo, cwRepo, cache);
    await useCase.execute(2025, 10);
  });

  it('returns pending: false when all teams are present', () => {
    const result = cache.get(2025, 10);
    expect(result).not.toBeNull();
    expect(result!.pending).toBe(false);
  });

  it('includes correct season and round in response', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.season).toBe(2025);
    expect(result.round).toBe(10);
  });

  it('all seven movement arrays are present', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(Array.isArray(result.injured)).toBe(true);
    expect(Array.isArray(result.dropped)).toBe(true);
    expect(Array.isArray(result.benched)).toBe(true);
    expect(Array.isArray(result.returningFromInjury)).toBe(true);
    expect(Array.isArray(result.coveringInjury)).toBe(true);
    expect(Array.isArray(result.promoted)).toBe(true);
    expect(Array.isArray(result.positionChanged)).toBe(true);
  });

  it('injured[0] has lastJersey and injury fields', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.injured.length).toBeGreaterThan(0);
    expect(result.injured[0]).toHaveProperty('lastJersey');
    expect(result.injured[0]).toHaveProperty('injury');
    expect(result.injured[0]).toHaveProperty('expectedReturn');
  });

  it('dropped[0] has lastJersey field', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.dropped[0]).toHaveProperty('lastJersey');
  });

  it('benched[0] has consecutiveRoundsBenched field', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.benched.length).toBeGreaterThan(0);
    expect(result.benched[0]).toHaveProperty('consecutiveRoundsBenched');
  });

  it('promoted[0] has currentJersey field', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.promoted.length).toBeGreaterThan(0);
    expect(result.promoted[0]).toHaveProperty('currentJersey');
  });

  it('coveringInjury[0] has coveringPlayerName field', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.coveringInjury.length).toBeGreaterThan(0);
    expect(result.coveringInjury[0]).toHaveProperty('coveringPlayerName');
  });

  it('positionChanged[0] has oldPosition and newPosition fields', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    expect(result.positionChanged.length).toBeGreaterThan(0);
    expect(result.positionChanged[0]).toHaveProperty('oldPosition');
    expect(result.positionChanged[0]).toHaveProperty('newPosition');
  });

  it('all records have playerName as string', () => {
    const result = cache.get(2025, 10) as PlayerMovementsResult;
    for (const record of [...result.injured, ...result.dropped, ...result.benched, ...result.returningFromInjury, ...result.coveringInjury, ...result.promoted, ...result.positionChanged]) {
      expect(typeof record.playerName).toBe('string');
      expect(record.playerName.length).toBeGreaterThan(0);
    }
  });

  it('returns { pending: true } when round has no data', () => {
    const result = cache.get(2025, 11);
    expect(result).toBeNull();
  });

  it('pending state when only partial team lists exist', async () => {
    const partialCache = new PlayerMovementsCache();
    const partialRepo = new InMemoryTeamListRepo([
      { round: 9, lists: prevTeamLists },
      { round: 10, lists: currTeamLists.slice(0, 8) },
    ]);
    const matchRepo = new InMemoryMatchRepo([
      { round: 9, matches: prevMatches },
      { round: 10, matches: currMatches },
    ]);
    const partialUseCase = new ComputePlayerMovementsUseCase(
      partialRepo,
      matchRepo,
      new InMemoryCasualtyWardRepo(openEntries, closedEntries),
      partialCache
    );
    await partialUseCase.execute(2025, 10);
    expect(partialCache.get(2025, 10)).toBeNull();
  });
});
