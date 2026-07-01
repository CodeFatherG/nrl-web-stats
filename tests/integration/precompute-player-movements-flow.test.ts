/**
 * T026 — End-to-end precompute flow for player-movements artifact.
 *
 * Feature: 035-player-movements-artifact.
 *
 * Fixture: team lists for (year=2025, round=10) are present and complete in the
 * stub TeamListRepository; movements repository starts empty.
 *
 * Trigger: dispatch a `compute-player-movements` job through
 *   `HandleScrapeJobUseCase`. The handler delegates to
 *   `ComputePlayerMovementsUseCase`, which reads team lists and writes the
 *   artifact via the repository.
 *
 * Asserts:
 *   - After dispatch, `repository.findByYearAndRound(2025, 10)` returns a
 *     populated artifact whose `season` and `round` match the request.
 *   - A second dispatch is idempotent (last-write-wins): the artifact remains
 *     readable with the same shape.
 *   - When no `CACHE` binding is present (in-memory fallback path is the
 *     adapter under test here), the flow still works end-to-end (FR-020).
 *     The same test exercises this implicitly because we wire the InMemory
 *     adapter directly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ComputePlayerMovementsUseCase } from '../../src/application/use-cases/compute-player-movements.js';
import {
  HandleScrapeJobUseCase,
  type HandleScrapeJobDeps,
} from '../../src/application/use-cases/handle-scrape-job.js';
import { InMemoryPlayerMovementsRepository } from '../../src/infrastructure/persistence/in-memory-player-movements-repository.js';
import type {
  JobHandle,
  ScrapeJob,
} from '../../src/application/ports/job-queue.js';
import type { TeamListRepository } from '../../src/domain/repositories/team-list-repository.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { CasualtyWardRepository } from '../../src/domain/repositories/casualty-ward-repository.js';
import type { TeamList } from '../../src/domain/team-list.js';
import type { Match } from '../../src/domain/match.js';
import type { CasualtyWardEntry } from '../../src/domain/casualty-ward-entry.js';

const fixturesDir = path.join(__dirname, '../fixtures/movements');

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8')) as T;
}

const prevTeamLists = loadJson<TeamList[]>('team-lists-round-prev.json');
const currTeamLists = loadJson<TeamList[]>('team-lists-round-curr.json');
const openEntries = loadJson<CasualtyWardEntry[]>('casualty-ward-open.json');
const closedEntries = loadJson<CasualtyWardEntry[]>('casualty-ward-closed.json');

class InMemoryTeamListRepo implements TeamListRepository {
  private readonly byRound = new Map<number, TeamList[]>();
  constructor(rounds: { round: number; lists: TeamList[] }[]) {
    for (const { round, lists } of rounds) this.byRound.set(round, lists);
  }
  async findByYearAndRound(_year: number, round: number): Promise<TeamList[]> {
    return this.byRound.get(round) ?? [];
  }
  async save(_tl: TeamList): Promise<void> {}
  async saveAll(_tls: TeamList[]): Promise<void> {}
  async findByMatch(_id: string): Promise<TeamList[]> { return []; }
  async hasTeamList(_id: string, _t: string): Promise<boolean> { return false; }
  async hasTeamListsForMatch(_id: string): Promise<boolean> { return false; }
  async getRoundsWithTeamLists(_y: number): Promise<Set<number>> { return new Set(this.byRound.keys()); }
  async findRoundsWithCompleteTeamLists(_y: number): Promise<ReadonlySet<number>> {
    return new Set(this.byRound.keys());
  }
}

class InMemoryMatchRepo implements MatchRepository {
  private readonly byRound = new Map<number, Match[]>();
  constructor(rounds: { round: number; matches: Match[] }[]) {
    for (const { round, matches } of rounds) this.byRound.set(round, matches);
  }
  async findByYearAndRound(_y: number, round: number): Promise<Match[]> {
    return this.byRound.get(round) ?? [];
  }
  async save(_m: Match): Promise<void> {}
  async saveAll(_ms: Match[]): Promise<void> {}
  async findByTeam(_c: string, _y?: number): Promise<Match[]> { return []; }
  async findById(_id: string): Promise<Match | null> { return null; }
  async findByYear(_y: number): Promise<Match[]> { return []; }
  async getLoadedYears(): Promise<number[]> { return [2025]; }
  async isYearLoaded(_y: number): Promise<boolean> { return true; }
  async getMatchCount(): Promise<number> { return 0; }
}

class InMemoryCasualtyWardRepo implements CasualtyWardRepository {
  constructor(private readonly open: CasualtyWardEntry[], private readonly closed: CasualtyWardEntry[]) {}
  async findOpen(): Promise<CasualtyWardEntry[]> { return this.open; }
  async findRecentlyClosed(_d: string): Promise<CasualtyWardEntry[]> { return this.closed; }
  async insert(e: CasualtyWardEntry): Promise<CasualtyWardEntry> { return e; }
  async update(_e: CasualtyWardEntry): Promise<void> {}
  async findByPlayerId(_id: string): Promise<CasualtyWardEntry[]> { return []; }
  async findAll(): Promise<CasualtyWardEntry[]> { return [...this.open, ...this.closed]; }
  async close(_id: number, _d: string): Promise<void> {}
  async findRecentlyClosedByKey(_f: string, _l: string, _t: string, _d: string): Promise<CasualtyWardEntry | null> { return null; }
  async reopen(_id: number): Promise<void> {}
}

function matchesFromTeamLists(year: number, round: number, teamLists: TeamList[]): Match[] {
  const ids = [...new Set(teamLists.map(tl => tl.matchId))];
  return ids.map(id => {
    const parts = id.split('-');
    return {
      id,
      year,
      round,
      homeTeamCode: parts[2] ?? null,
      awayTeamCode: parts[3] ?? null,
      homeStrengthRating: null,
      awayStrengthRating: null,
      homeScore: null,
      awayScore: null,
      status: 'Scheduled' as const,
      scheduledTime: `${year}-04-21T10:00:00.000Z`,
      stadium: null,
      weather: null,
    };
  });
}

function recordingHandle(body: ScrapeJob): JobHandle<ScrapeJob> & { acks: number } {
  const state = { settled: false, acks: 0 };
  const h: JobHandle<ScrapeJob> & { acks: number } = {
    body,
    attemptCount: 1,
    get acks() { return state.acks; },
    ack() {
      if (state.settled) return;
      state.settled = true;
      state.acks += 1;
    },
    retry() { state.settled = true; },
  };
  return h;
}

describe('end-to-end precompute flow for player movements', () => {
  let repository: InMemoryPlayerMovementsRepository;
  let dispatcher: HandleScrapeJobUseCase;

  beforeEach(() => {
    repository = new InMemoryPlayerMovementsRepository();
    const prevMatches = matchesFromTeamLists(2025, 9, prevTeamLists);
    const currMatches = matchesFromTeamLists(2025, 10, currTeamLists);
    const teamListRepo = new InMemoryTeamListRepo([
      { round: 9, lists: prevTeamLists },
      { round: 10, lists: currTeamLists },
    ]);
    const matchRepo = new InMemoryMatchRepo([
      { round: 9, matches: prevMatches },
      { round: 10, matches: currMatches },
    ]);
    const cwRepo = new InMemoryCasualtyWardRepo(openEntries, closedEntries);
    const computeUseCase = new ComputePlayerMovementsUseCase(
      teamListRepo,
      matchRepo,
      cwRepo,
      repository,
    );

    const deps: HandleScrapeJobDeps = {
      scrapeMatchResults: { execute: async () => ({}) } as any,
      scrapePlayerStats: { execute: async () => ({}) } as any,
      scrapeSupplementaryStats: { execute: async () => ({}) } as any,
      scrapeTeamLists: { execute: async () => ({}) } as any,
      scrapeCasualtyWard: { execute: async () => ({}) } as any,
      computePlayerMovements: computeUseCase,
      lockGameStrength: { execute: async () => ({}) } as any,
    };
    dispatcher = new HandleScrapeJobUseCase(deps);
  });

  it('dispatching compute-player-movements writes a readable artifact', async () => {
    const handle = recordingHandle({
      type: 'compute-player-movements',
      version: 1,
      year: 2025,
      round: 10,
    });
    await dispatcher.handleOne(handle);
    expect(handle.acks).toBe(1);

    const result = await repository.findByYearAndRound(2025, 10);
    expect(result).not.toBeNull();
    expect(result!.season).toBe(2025);
    expect(result!.round).toBe(10);
  });

  it('FR-020: no-CACHE binding path — InMemory adapter serves end-to-end', async () => {
    // This entire test suite already exercises the no-CACHE path because the
    // dispatcher is wired to InMemoryPlayerMovementsRepository (selected when
    // env.CACHE is absent in worker.ts:102-105). This test makes the assertion
    // explicit: a flow that writes then reads via InMemory succeeds without
    // any KV binding being constructed.
    const handle = recordingHandle({
      type: 'compute-player-movements',
      version: 1,
      year: 2025,
      round: 10,
    });
    await dispatcher.handleOne(handle);
    expect(handle.acks).toBe(1);
    const result = await repository.findByYearAndRound(2025, 10);
    expect(result).not.toBeNull();
  });

  it('a second dispatch is idempotent under last-write-wins', async () => {
    const job: ScrapeJob = {
      type: 'compute-player-movements',
      version: 1,
      year: 2025,
      round: 10,
    };
    await dispatcher.handleOne(recordingHandle(job));
    const first = await repository.findByYearAndRound(2025, 10);
    await dispatcher.handleOne(recordingHandle(job));
    const second = await repository.findByYearAndRound(2025, 10);
    expect(second).not.toBeNull();
    expect(second!.season).toBe(first!.season);
    expect(second!.round).toBe(first!.round);
    expect(second!.injured.length).toBe(first!.injured.length);
  });
});
