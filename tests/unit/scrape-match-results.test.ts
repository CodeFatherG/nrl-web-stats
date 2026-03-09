import { describe, it, expect, vi } from 'vitest';
import { ScrapeMatchResultsUseCase, findRoundsNeedingScrape } from '../../src/application/use-cases/scrape-match-results.js';
import type { MatchResultSource, MatchResult } from '../../src/domain/ports/match-result-source.js';
import type { MatchRepository } from '../../src/domain/repositories/match-repository.js';
import type { Match } from '../../src/domain/match.js';
import { MatchStatus, createMatchFromSchedule, enrichWithResult, createMatchId } from '../../src/domain/match.js';
import { success, failure } from '../../src/domain/result.js';

function createMockMatchResultSource(
  result: ReturnType<typeof success<MatchResult[]>> | ReturnType<typeof failure<MatchResult[]>>
): MatchResultSource {
  return {
    fetchResults: vi.fn().mockResolvedValue(result),
  };
}

function createMockMatchRepository(): MatchRepository & {
  save: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
} {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    saveAll: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByYear: vi.fn().mockResolvedValue([]),
    findByYearAndRound: vi.fn().mockResolvedValue([]),
    findByTeam: vi.fn().mockResolvedValue([]),
    getLoadedYears: vi.fn().mockResolvedValue([]),
    isYearLoaded: vi.fn().mockResolvedValue(false),
    getMatchCount: vi.fn().mockResolvedValue(0),
  };
}

const testResults: MatchResult[] = [
  {
    matchId: '2025-R1-BRO-SYD',
    homeTeamCode: 'SYD',
    awayTeamCode: 'BRO',
    year: 2025,
    round: 1,
    homeScore: 14,
    awayScore: 50,
    status: MatchStatus.Completed,
    scheduledTime: '2025-03-06T09:00:00Z',
    weather: null,
  },
  {
    matchId: '2025-R1-CBR-NZL',
    homeTeamCode: 'CBR',
    awayTeamCode: 'NZL',
    year: 2025,
    round: 1,
    homeScore: 30,
    awayScore: 8,
    status: MatchStatus.Completed,
    scheduledTime: '2025-03-02T00:00:00Z',
    weather: null,
  },
];

// =============================================
// T011: ScrapeMatchResultsUseCase tests
// =============================================
describe('ScrapeMatchResultsUseCase', () => {
  it('calls adapter fetchResults with year and round', async () => {
    const source = createMockMatchResultSource(success(testResults));
    const repo = createMockMatchRepository();

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    await useCase.execute(2025, 1);

    expect(source.fetchResults).toHaveBeenCalledWith(2025, 1);
  });

  it('enriches existing Match aggregates via matchRepository.save()', async () => {
    const source = createMockMatchResultSource(success(testResults));
    const repo = createMockMatchRepository();

    // Pre-populate an existing match (from schedule data)
    const existingMatch = createMatchFromSchedule({
      year: 2025,
      round: 1,
      homeTeamCode: 'SYD',
      awayTeamCode: 'BRO',
      homeStrengthRating: 750,
      awayStrengthRating: 800,
    });
    repo.findById.mockImplementation((id: string) =>
      Promise.resolve(id === '2025-R1-BRO-SYD' ? existingMatch : null)
    );

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    const result = await useCase.execute(2025, 1);

    expect(result.success).toBe(true);
    expect(result.enrichedCount).toBe(1); // SYD v BRO enriched
    expect(result.createdCount).toBe(1); // CBR v NZL created (not found)

    // Verify save was called for each result
    expect(repo.save).toHaveBeenCalledTimes(2);

    // Verify enriched match preserves strength ratings
    const enrichedSaveCall = repo.save.mock.calls.find(
      (call: any[]) => call[0].id === '2025-R1-BRO-SYD'
    );
    expect(enrichedSaveCall).toBeDefined();
    const enrichedMatch = enrichedSaveCall![0];
    expect(enrichedMatch.homeScore).toBe(14);
    expect(enrichedMatch.awayScore).toBe(50);
    expect(enrichedMatch.status).toBe(MatchStatus.Completed);
    expect(enrichedMatch.homeStrengthRating).toBe(750); // Preserved from schedule
    expect(enrichedMatch.awayStrengthRating).toBe(800); // Preserved from schedule
  });

  it('creates new Match when no existing data found', async () => {
    const source = createMockMatchResultSource(success(testResults));
    const repo = createMockMatchRepository();
    // findById returns null for all (default)

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    const result = await useCase.execute(2025, 1);

    expect(result.success).toBe(true);
    expect(result.createdCount).toBe(2);
    expect(result.enrichedCount).toBe(0);

    // Verify created match has null strength ratings
    const createdSaveCall = repo.save.mock.calls.find(
      (call: any[]) => call[0].id === '2025-R1-BRO-SYD'
    );
    expect(createdSaveCall).toBeDefined();
    const createdMatch = createdSaveCall![0];
    expect(createdMatch.homeScore).toBe(14);
    expect(createdMatch.awayScore).toBe(50);
    expect(createdMatch.homeStrengthRating).toBeNull();
    expect(createdMatch.awayStrengthRating).toBeNull();
  });

  it('returns failure result when adapter fails', async () => {
    const source = createMockMatchResultSource(failure('Network error'));
    const repo = createMockMatchRepository();

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    const result = await useCase.execute(2025, 1);

    expect(result.success).toBe(false);
    expect(result.enrichedCount).toBe(0);
    expect(result.createdCount).toBe(0);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('passes through warnings from adapter', async () => {
    const warnings = [
      { type: 'UNMAPPED_TEAM' as const, message: 'Unknown teamId 999', context: { teamId: 999 } },
    ];
    const source = createMockMatchResultSource(success(testResults, warnings));
    const repo = createMockMatchRepository();

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    const result = await useCase.execute(2025, 1);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('UNMAPPED_TEAM');
  });

  // =============================================
  // T017: Enrichment idempotency
  // =============================================
  it('idempotent: scraping same results twice produces identical match state (T017)', async () => {
    const singleResult: MatchResult[] = [testResults[0]]; // BRO-SYD only

    // Pre-populate an existing match with schedule data
    const existingMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });

    // Simulate first scrape: enrich and capture the saved match
    const enrichedOnce = enrichWithResult(existingMatch, {
      homeScore: 14, awayScore: 50,
      status: MatchStatus.Completed,
      scheduledTime: '2025-03-06T09:00:00Z',
    });

    // Simulate second scrape: re-enrich the already-enriched match
    const enrichedTwice = enrichWithResult(enrichedOnce, {
      homeScore: 14, awayScore: 50,
      status: MatchStatus.Completed,
      scheduledTime: '2025-03-06T09:00:00Z',
    });

    // State must be identical after both enrichments
    expect(enrichedTwice).toEqual(enrichedOnce);
    expect(enrichedTwice.homeScore).toBe(14);
    expect(enrichedTwice.awayScore).toBe(50);
    expect(enrichedTwice.status).toBe(MatchStatus.Completed);
    expect(enrichedTwice.homeStrengthRating).toBe(750);
    expect(enrichedTwice.awayStrengthRating).toBe(800);
  });

  it('idempotent: status never downgrades from Completed to Scheduled (T017)', async () => {
    const completedMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });

    // First enrich to Completed
    const enriched = enrichWithResult(completedMatch, {
      homeScore: 14, awayScore: 50,
      status: MatchStatus.Completed,
      scheduledTime: '2025-03-06T09:00:00Z',
    });

    // Try to "downgrade" to Scheduled — status must remain Completed
    const reEnriched = enrichWithResult(enriched, {
      homeScore: 0, awayScore: 0,
      status: MatchStatus.Scheduled,
      scheduledTime: '2025-03-06T09:00:00Z',
    });

    expect(reEnriched.status).toBe(MatchStatus.Completed);
    // Scores preserved (enrichWithResult preserves existing non-null fields)
    expect(reEnriched.homeScore).toBe(14);
    expect(reEnriched.awayScore).toBe(50);
  });

  it('idempotent: use case scrape twice produces same counts on second run (T017)', async () => {
    const singleResult: MatchResult[] = [testResults[0]];
    const source = createMockMatchResultSource(success(singleResult));

    // Use a stateful mock repo to simulate real behavior
    let savedMatch: Match | null = null;
    const repo = createMockMatchRepository();
    repo.save.mockImplementation((match: Match) => { savedMatch = match; return Promise.resolve(); });
    repo.findById.mockImplementation((id: string) =>
      Promise.resolve(id === '2025-R1-BRO-SYD' ? savedMatch : null)
    );

    const useCase = new ScrapeMatchResultsUseCase(source, repo);

    // First scrape: creates new match
    const result1 = await useCase.execute(2025, 1);
    expect(result1.createdCount).toBe(1);
    expect(result1.enrichedCount).toBe(0);

    // Second scrape: enriches existing match (same data)
    const result2 = await useCase.execute(2025, 1);
    expect(result2.createdCount).toBe(0);
    expect(result2.enrichedCount).toBe(1);

    // Match state after second scrape should have same scores
    expect(savedMatch!.homeScore).toBe(14);
    expect(savedMatch!.awayScore).toBe(50);
    expect(savedMatch!.status).toBe(MatchStatus.Completed);
  });

  // =============================================
  // T018: Partial match creation
  // =============================================
  it('partial match creation: no schedule data produces null strength ratings (T018)', async () => {
    const source = createMockMatchResultSource(success(testResults));
    const repo = createMockMatchRepository();
    // findById returns null for all — no existing schedule data

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    const result = await useCase.execute(2025, 1);

    expect(result.createdCount).toBe(2);

    // Check both created matches have null strength ratings
    for (const call of repo.save.mock.calls) {
      const match = call[0] as Match;
      expect(match.homeStrengthRating).toBeNull();
      expect(match.awayStrengthRating).toBeNull();
      // But scores and status are present
      expect(match.homeScore).toBeGreaterThanOrEqual(0);
      expect(match.awayScore).toBeGreaterThanOrEqual(0);
      expect(match.status).toBe(MatchStatus.Completed);
    }
  });

  it('partial match creation: homeTeamCode and awayTeamCode are null (T018)', async () => {
    const source = createMockMatchResultSource(success(testResults));
    const repo = createMockMatchRepository();

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    await useCase.execute(2025, 1);

    // createMatchFromResult sets team codes to null (no schedule context)
    for (const call of repo.save.mock.calls) {
      const match = call[0] as Match;
      expect(match.homeTeamCode).toBeNull();
      expect(match.awayTeamCode).toBeNull();
    }
  });

  // =============================================
  // T019: Enrichment path verification
  // =============================================
  it('enrichment preserves schedule fields when adding result data (T019)', async () => {
    const singleResult: MatchResult[] = [testResults[0]]; // BRO-SYD
    const source = createMockMatchResultSource(success(singleResult));
    const repo = createMockMatchRepository();

    const existingMatch = createMatchFromSchedule({
      year: 2025, round: 1,
      homeTeamCode: 'SYD', awayTeamCode: 'BRO',
      homeStrengthRating: 750, awayStrengthRating: 800,
    });
    repo.findById.mockImplementation((id: string) =>
      Promise.resolve(id === '2025-R1-BRO-SYD' ? existingMatch : null)
    );

    const useCase = new ScrapeMatchResultsUseCase(source, repo);
    await useCase.execute(2025, 1);

    const savedMatch = repo.save.mock.calls[0][0] as Match;

    // Schedule fields preserved
    expect(savedMatch.homeTeamCode).toBe('SYD');
    expect(savedMatch.awayTeamCode).toBe('BRO');
    expect(savedMatch.homeStrengthRating).toBe(750);
    expect(savedMatch.awayStrengthRating).toBe(800);

    // Result fields populated
    expect(savedMatch.homeScore).toBe(14);
    expect(savedMatch.awayScore).toBe(50);
    expect(savedMatch.status).toBe(MatchStatus.Completed);
    expect(savedMatch.scheduledTime).toBe('2025-03-06T09:00:00Z');
  });
});

// =============================================
// T020: Post-completion detection logic
// =============================================
describe('findRoundsNeedingScrape', () => {
  function createMatchWithScheduledTime(
    year: number, round: number,
    homeCode: string, awayCode: string,
    scheduledTime: string, status: MatchStatus = MatchStatus.Scheduled
  ): Match {
    return {
      id: createMatchId(homeCode, awayCode, year, round),
      year,
      round,
      homeTeamCode: homeCode,
      awayTeamCode: awayCode,
      homeStrengthRating: 700,
      awayStrengthRating: 600,
      homeScore: status === MatchStatus.Completed ? 20 : null,
      awayScore: status === MatchStatus.Completed ? 10 : null,
      status,
      scheduledTime,
      stadium: null,
      weather: null,
    };
  }

  it('identifies rounds with games past estimated completion (kick-off + 2h)', async () => {
    const repo = createMockMatchRepository();
    const matches = [
      // Round 1: game at 09:00Z, now is 12:00Z (3h after → past 2h buffer)
      createMatchWithScheduledTime(2025, 1, 'SYD', 'BRO', '2025-03-06T09:00:00Z'),
    ];
    repo.findByYear.mockResolvedValue(matches);
    (repo as any).getLoadedYears = vi.fn().mockResolvedValue([2025]);

    const currentTime = new Date('2025-03-06T12:00:00Z');
    const roundsNeeded = await findRoundsNeedingScrape(repo, currentTime);

    expect(roundsNeeded).toEqual([{ year: 2025, round: 1 }]);
  });

  it('does NOT flag rounds where game is still within 2h buffer', async () => {
    const repo = createMockMatchRepository();
    const matches = [
      // Round 1: game at 09:00Z, now is 10:30Z (1.5h after → within buffer)
      createMatchWithScheduledTime(2025, 1, 'SYD', 'BRO', '2025-03-06T09:00:00Z'),
    ];
    repo.findByYear.mockResolvedValue(matches);
    (repo as any).getLoadedYears = vi.fn().mockResolvedValue([2025]);

    const currentTime = new Date('2025-03-06T10:30:00Z');
    const roundsNeeded = await findRoundsNeedingScrape(repo, currentTime);

    expect(roundsNeeded).toEqual([]);
  });

  it('skips rounds where all matches are Completed', async () => {
    const repo = createMockMatchRepository();
    const matches = [
      createMatchWithScheduledTime(2025, 1, 'SYD', 'BRO', '2025-03-06T09:00:00Z', MatchStatus.Completed),
    ];
    repo.findByYear.mockResolvedValue(matches);
    (repo as any).getLoadedYears = vi.fn().mockResolvedValue([2025]);

    const currentTime = new Date('2025-03-06T12:00:00Z');
    const roundsNeeded = await findRoundsNeedingScrape(repo, currentTime);

    expect(roundsNeeded).toEqual([]);
  });

  it('returns empty when no schedule data exists (off-season)', async () => {
    const repo = createMockMatchRepository();
    (repo as any).getLoadedYears = vi.fn().mockResolvedValue([]);

    const currentTime = new Date('2025-03-06T12:00:00Z');
    const roundsNeeded = await findRoundsNeedingScrape(repo, currentTime);

    expect(roundsNeeded).toEqual([]);
  });

  it('identifies multiple rounds needing scrape', async () => {
    const repo = createMockMatchRepository();
    const matches = [
      // Round 1: past completion
      createMatchWithScheduledTime(2025, 1, 'SYD', 'BRO', '2025-03-06T09:00:00Z'),
      // Round 2: past completion
      createMatchWithScheduledTime(2025, 2, 'MEL', 'PTH', '2025-03-13T09:00:00Z'),
      // Round 3: not yet played
      createMatchWithScheduledTime(2025, 3, 'CBR', 'NZL', '2025-03-20T09:00:00Z'),
    ];
    repo.findByYear.mockResolvedValue(matches);
    (repo as any).getLoadedYears = vi.fn().mockResolvedValue([2025]);

    const currentTime = new Date('2025-03-14T12:00:00Z');
    const roundsNeeded = await findRoundsNeedingScrape(repo, currentTime);

    expect(roundsNeeded).toEqual([
      { year: 2025, round: 1 },
      { year: 2025, round: 2 },
    ]);
  });

  it('only flags a round once even with multiple games past completion', async () => {
    const repo = createMockMatchRepository();
    const matches = [
      createMatchWithScheduledTime(2025, 1, 'SYD', 'BRO', '2025-03-06T09:00:00Z'),
      createMatchWithScheduledTime(2025, 1, 'MEL', 'PTH', '2025-03-06T10:00:00Z'),
    ];
    repo.findByYear.mockResolvedValue(matches);
    (repo as any).getLoadedYears = vi.fn().mockResolvedValue([2025]);

    const currentTime = new Date('2025-03-06T13:00:00Z');
    const roundsNeeded = await findRoundsNeedingScrape(repo, currentTime);

    expect(roundsNeeded).toEqual([{ year: 2025, round: 1 }]);
  });
});
