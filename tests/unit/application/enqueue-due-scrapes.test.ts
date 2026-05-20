import { describe, it, expect, beforeEach } from 'vitest';
import {
  EnqueueDueScrapesUseCase,
  type EnqueueDueScrapesDeps,
} from '../../../src/application/use-cases/enqueue-due-scrapes.js';
import type { JobProducer, ScrapeJob } from '../../../src/application/ports/job-queue.js';
import type { MatchRepository } from '../../../src/domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../../src/domain/repositories/player-repository.js';
import type { TeamListRepository } from '../../../src/domain/repositories/team-list-repository.js';
import type { Match } from '../../../src/domain/match.js';
import { MatchStatus, createMatchId } from '../../../src/domain/match.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeProducer implements JobProducer {
  readonly published: ScrapeJob[] = [];
  async publish(job: ScrapeJob): Promise<void> {
    this.published.push(job);
  }
  async publishBatch(jobs: readonly ScrapeJob[]): Promise<void> {
    this.published.push(...jobs);
  }
}

function fakeMatchRepo(matches: Match[]): MatchRepository {
  const years = [...new Set(matches.map(m => m.year))];
  return {
    save: async () => {},
    saveAll: async () => {},
    findById: async (id) => matches.find(m => m.id === id) ?? null,
    findByYear: async (year) => matches.filter(m => m.year === year),
    findByYearAndRound: async (year, round) => matches.filter(m => m.year === year && m.round === round),
    findByTeam: async () => [],
    getLoadedYears: async () => years,
    isYearLoaded: async (y) => years.includes(y),
    getMatchCount: async () => matches.length,
  } as MatchRepository;
}

function fakePlayerRepo(opts: {
  matchesPerRound?: Map<string, number>;
  completeRounds?: Set<string>;
} = {}): PlayerRepository {
  return {
    save: async () => {},
    findByTeam: async () => [],
    findById: async () => null,
    findMatchPerformances: async () => [],
    findSeasonAggregates: async () => null,
    isRoundComplete: async (season, round) => opts.completeRounds?.has(`${season}-${round}`) ?? false,
    countDistinctMatchesInRound: async (season, round) =>
      opts.matchesPerRound?.get(`${season}-${round}`) ?? 0,
    findPerformancesByMatch: async () => [],
    findAllSeasonSummaries: async () => [],
    findAllSeasonPerformancesSummary: async () => [],
  };
}

function fakeTeamListRepo(): TeamListRepository {
  return {
    save: async () => {},
    saveAll: async () => {},
    findByMatch: async () => [],
    findByYearAndRound: async () => [],
    hasTeamList: async () => true,
    hasTeamListsForMatch: async () => true,
    getRoundsWithTeamLists: async () => new Set(),
  };
}

function makeDeps(overrides: Partial<EnqueueDueScrapesDeps> & { producer: FakeProducer }): EnqueueDueScrapesDeps {
  return {
    matchRepository: overrides.matchRepository ?? fakeMatchRepo([]),
    playerRepository: overrides.playerRepository ?? fakePlayerRepo(),
    supplementaryRepo: overrides.supplementaryRepo ?? {
      isRoundCached: async () => true,
      findRoundsWithNullPriceBreakEven: async () => [],
      findRoundsWithNullTeamCode: async () => [],
    },
    teamListRepository: overrides.teamListRepository ?? fakeTeamListRepo(),
    gameStrengthRepo: overrides.gameStrengthRepo ?? { findByRound: async () => null },
    matchResultSource: overrides.matchResultSource ?? { fetchResults: async () => ({} as any), isAvailable: async () => true },
    playerStatsSource: overrides.playerStatsSource ?? { fetchPlayerStats: async () => ({} as any), isAvailable: async () => true },
    supplementaryStatsSource: overrides.supplementaryStatsSource ?? { fetchSupplementaryStats: async () => ({} as any), isAvailable: async () => true },
    teamListSource: overrides.teamListSource ?? {
      fetchTeamLists: async () => ({} as any),
      fetchTeamListForMatch: async () => ({} as any),
      isAvailable: async () => true,
    },
    casualtyWardSource: overrides.casualtyWardSource ?? { fetchCasualtyWard: async () => ({} as any), isAvailable: async () => true },
    producer: overrides.producer,
  };
}

function baseMatch(year: number, round: number, home: string, away: string, scheduledTime: string | null): Match {
  return {
    id: createMatchId(home, away, year, round),
    year,
    round,
    homeTeamCode: home,
    awayTeamCode: away,
    homeStrengthRating: 1500,
    awayStrengthRating: 1500,
    homeScore: null,
    awayScore: null,
    status: MatchStatus.Scheduled,
    scheduledTime,
    stadium: null,
    weather: null,
  };
}

function completedMatch(year: number, round: number, home: string, away: string): Match {
  return { ...baseMatch(year, round, home, away, '2026-03-01T00:00:00Z'), status: MatchStatus.Completed };
}

function scheduledMatch(year: number, round: number, home: string, away: string, scheduledTime: string): Match {
  return baseMatch(year, round, home, away, scheduledTime);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnqueueDueScrapesUseCase', () => {
  let producer: FakeProducer;
  beforeEach(() => {
    producer = new FakeProducer();
  });

  it('emits zero jobs when nothing is due (empty repos)', async () => {
    const uc = new EnqueueDueScrapesUseCase(makeDeps({ producer }));
    const summary = await uc.execute({ scheduledTime: new Date('2026-05-20T12:00:00Z') });
    // Casualty ward fires every tick — the only "always-on" emission.
    expect(summary.jobCounts['scrape-casualty-ward']).toBe(1);
    expect(producer.published.filter(j => j.type === 'scrape-match-results')).toHaveLength(0);
  });

  it('publishes scrape-match-results for each round flagged by findRoundsNeedingScrape', async () => {
    const past = '2026-03-01T00:00:00Z'; // long ago — completion buffer cleared
    const matches: Match[] = [
      scheduledMatch(2026, 10, 'SYD', 'PEN', past),
      scheduledMatch(2026, 11, 'BRI', 'MEL', past),
    ];
    const uc = new EnqueueDueScrapesUseCase(makeDeps({
      producer,
      matchRepository: fakeMatchRepo(matches),
    }));
    await uc.execute({ scheduledTime: new Date('2026-05-20T12:00:00Z'), currentYear: 2026 });

    const matchJobs = producer.published.filter(j => j.type === 'scrape-match-results');
    expect(matchJobs.map(j => (j as any).round).sort()).toEqual([10, 11]);
  });

  it('skips a job when the source.isAvailable probe returns false (totalSkipped increments)', async () => {
    const past = '2026-03-01T00:00:00Z';
    const matches = [scheduledMatch(2026, 5, 'SYD', 'PEN', past)];
    const uc = new EnqueueDueScrapesUseCase(makeDeps({
      producer,
      matchRepository: fakeMatchRepo(matches),
      matchResultSource: { fetchResults: async () => ({} as any), isAvailable: async () => false },
    }));
    const summary = await uc.execute({ scheduledTime: new Date('2026-05-20T12:00:00Z') });
    expect(summary.totalSkipped).toBeGreaterThan(0);
    expect(producer.published.filter(j => j.type === 'scrape-match-results')).toHaveLength(0);
  });

  it('dedupes the same {year, round} between match-results and player-stats discovery', async () => {
    // Round 5: all matches completed in D1, no player stats yet.
    // findRoundsNeedingScrape returns nothing (already completed), but findRoundsNeedingPlayerStats
    // returns round 5 → expect a scrape-player-stats job, not duplicated.
    const matches = [completedMatch(2026, 5, 'SYD', 'PEN')];
    const uc = new EnqueueDueScrapesUseCase(makeDeps({
      producer,
      matchRepository: fakeMatchRepo(matches),
      playerRepository: fakePlayerRepo({ matchesPerRound: new Map([['2026-5', 0]]) }),
      supplementaryRepo: {
        isRoundCached: async () => true,
        findRoundsWithNullPriceBreakEven: async () => [],
        findRoundsWithNullTeamCode: async () => [],
      },
    }));
    await uc.execute({ scheduledTime: new Date('2026-05-20T12:00:00Z'), currentYear: 2026 });

    expect(producer.published.filter(j => j.type === 'scrape-player-stats')).toHaveLength(1);
    expect(producer.published.filter(j => j.type === 'scrape-match-results')).toHaveLength(0);
  });

  it('shadow mode emits the discovery.published log but does NOT call producer.publish', async () => {
    const past = '2026-03-01T00:00:00Z';
    const matches = [scheduledMatch(2026, 7, 'SYD', 'PEN', past)];
    const uc = new EnqueueDueScrapesUseCase(makeDeps({
      producer,
      matchRepository: fakeMatchRepo(matches),
    }));
    const summary = await uc.execute({
      scheduledTime: new Date('2026-05-20T12:00:00Z'),
      currentYear: 2026,
      shadowMode: true,
    });

    expect(summary.shadowMode).toBe(true);
    expect(summary.totalPublished).toBeGreaterThan(0);
    expect(producer.published).toHaveLength(0); // shadow mode skips the actual call
  });

  it('publishes a force=true supplementary-stats job for null-column backfill rounds', async () => {
    const uc = new EnqueueDueScrapesUseCase(makeDeps({
      producer,
      supplementaryRepo: {
        isRoundCached: async () => true,
        findRoundsWithNullPriceBreakEven: async () => [{ year: 2026, round: 3 }],
        findRoundsWithNullTeamCode: async () => [],
      },
    }));
    await uc.execute({ scheduledTime: new Date('2026-05-20T12:00:00Z'), currentYear: 2026 });
    const suppJobs = producer.published.filter(j => j.type === 'scrape-supplementary-stats');
    expect(suppJobs).toHaveLength(1);
    expect((suppJobs[0] as any).force).toBe(true);
    expect((suppJobs[0] as any).year).toBe(2026);
    expect((suppJobs[0] as any).round).toBe(3);
  });

  it('emits one casualty-ward job per execution', async () => {
    const uc = new EnqueueDueScrapesUseCase(makeDeps({ producer }));
    await uc.execute({ scheduledTime: new Date('2026-05-20T12:00:00Z') });
    expect(producer.published.filter(j => j.type === 'scrape-casualty-ward')).toHaveLength(1);
  });
});
