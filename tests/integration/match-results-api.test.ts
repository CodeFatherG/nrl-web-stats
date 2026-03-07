/**
 * Integration test for match results scraping and season summary enrichment.
 * Tests the full pipeline: adapter → use case → repository → season summary
 * with a mocked nrl.com HTTP response.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryMatchRepository } from '../../src/database/in-memory-match-repository.js';
import { NrlComMatchResultAdapter } from '../../src/infrastructure/adapters/nrl-com-match-result-adapter.js';
import { ScrapeMatchResultsUseCase } from '../../src/application/use-cases/scrape-match-results.js';
import { createGetSeasonSummaryUseCase } from '../../src/application/use-cases/get-season-summary.js';
import { createMatchFromSchedule, MatchStatus } from '../../src/domain/match.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures/nrl-com');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

function mockFetchResponse(data: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Server Error',
    json: () => Promise.resolve(data),
  }));
}

describe('Match Results API Integration', () => {
  let matchRepository: InMemoryMatchRepository;
  let adapter: NrlComMatchResultAdapter;
  let scrapeUseCase: ScrapeMatchResultsUseCase;

  beforeEach(() => {
    matchRepository = new InMemoryMatchRepository();
    adapter = new NrlComMatchResultAdapter();
    scrapeUseCase = new ScrapeMatchResultsUseCase(adapter, matchRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('end-to-end: scrape results enriches season summary with scores', async () => {
    // 1. Pre-load schedule data (simulating what ScrapeDrawUseCase would do)
    const scheduleMatches = [
      createMatchFromSchedule({
        year: 2025, round: 1,
        homeTeamCode: 'CBR', awayTeamCode: 'NZL',
        homeStrengthRating: 700, awayStrengthRating: 600,
      }),
      createMatchFromSchedule({
        year: 2025, round: 1,
        homeTeamCode: 'SYD', awayTeamCode: 'BRO',
        homeStrengthRating: 800, awayStrengthRating: 750,
      }),
    ];
    matchRepository.loadForYear(2025, scheduleMatches);

    // 2. Mock nrl.com API response with completed round fixture
    const fixtureData = loadFixture('round-completed.json');
    mockFetchResponse(fixtureData);

    // 3. Execute scrape
    const scrapeResult = await scrapeUseCase.execute(2025, 1);

    expect(scrapeResult.success).toBe(true);
    expect(scrapeResult.enrichedCount).toBe(2);  // CBR-NZL and BRO-SYD enriched
    expect(scrapeResult.createdCount).toBe(6);   // Other 6 matches created

    // 4. Verify enriched match preserves strength ratings AND has scores
    const enrichedMatch = matchRepository.findById('2025-R1-CBR-NZL');
    expect(enrichedMatch).not.toBeNull();
    expect(enrichedMatch!.homeScore).toBe(30);
    expect(enrichedMatch!.awayScore).toBe(8);
    expect(enrichedMatch!.status).toBe(MatchStatus.Completed);
    expect(enrichedMatch!.homeStrengthRating).toBe(700);  // Preserved from schedule
    expect(enrichedMatch!.awayStrengthRating).toBe(600);  // Preserved from schedule
    expect(enrichedMatch!.scheduledTime).toBe('2025-03-02T00:00:00Z');

    // 5. Verify created match (no prior schedule) has scores but null strengths
    const createdMatch = matchRepository.findById('2025-R1-MNL-NQC');
    expect(createdMatch).not.toBeNull();
    expect(createdMatch!.homeScore).toBe(42);
    expect(createdMatch!.awayScore).toBe(12);
    expect(createdMatch!.status).toBe(MatchStatus.Completed);
    expect(createdMatch!.homeStrengthRating).toBeNull();
    expect(createdMatch!.awayStrengthRating).toBeNull();
  });

  it('season summary populates scores from enriched matches', async () => {
    // 1. Pre-load schedule data
    const scheduleMatches = [
      createMatchFromSchedule({
        year: 2025, round: 1,
        homeTeamCode: 'CBR', awayTeamCode: 'NZL',
        homeStrengthRating: 700, awayStrengthRating: 600,
      }),
    ];
    matchRepository.loadForYear(2025, scheduleMatches);

    // 2. Scrape results
    const fixtureData = loadFixture('round-completed.json');
    mockFetchResponse(fixtureData);
    await scrapeUseCase.execute(2025, 1);

    // 3. Get season summary with matchRepository
    const seasonSummary = createGetSeasonSummaryUseCase(matchRepository).execute(2025);

    expect(seasonSummary).not.toBeNull();
    if (!seasonSummary) return;

    // Find round 1
    const round1 = seasonSummary.rounds.find(r => r.round === 1);
    expect(round1).toBeDefined();

    // Find the CBR v NZL match
    const match = round1!.matches.find(m => m.homeTeam === 'CBR' && m.awayTeam === 'NZL');
    expect(match).toBeDefined();
    expect(match!.homeScore).toBe(30);
    expect(match!.awayScore).toBe(8);
    expect(match!.isComplete).toBe(true);
    expect(match!.scheduledTime).toBe('2025-03-02T00:00:00Z');
    // Strength ratings still present
    expect(match!.homeStrength).toBe(700);
    expect(match!.awayStrength).toBe(600);
  });

  it('cold-start scenario: season summary returns null/false defaults when no results scraped', () => {
    // Load schedule data only, no results scrape
    const scheduleMatches = [
      createMatchFromSchedule({
        year: 2025, round: 1,
        homeTeamCode: 'CBR', awayTeamCode: 'NZL',
        homeStrengthRating: 700, awayStrengthRating: 600,
      }),
    ];
    matchRepository.loadForYear(2025, scheduleMatches);

    // Season summary without matchRepository (old behavior)
    const seasonSummaryOld = createGetSeasonSummaryUseCase().execute(2025);
    expect(seasonSummaryOld).not.toBeNull();
    const round1Old = seasonSummaryOld!.rounds.find(r => r.round === 1);
    const matchOld = round1Old!.matches.find(m => m.homeTeam === 'CBR');
    expect(matchOld!.homeScore).toBeNull();
    expect(matchOld!.awayScore).toBeNull();
    expect(matchOld!.isComplete).toBe(false);
    expect(matchOld!.scheduledTime).toBeNull();

    // Season summary WITH matchRepository but no enrichment
    const seasonSummaryNew = createGetSeasonSummaryUseCase(matchRepository).execute(2025);
    expect(seasonSummaryNew).not.toBeNull();
    const round1New = seasonSummaryNew!.rounds.find(r => r.round === 1);
    const matchNew = round1New!.matches.find(m => m.homeTeam === 'CBR');
    // Match exists in repo from schedule but has no scores yet
    expect(matchNew!.homeScore).toBeNull();
    expect(matchNew!.awayScore).toBeNull();
    expect(matchNew!.isComplete).toBe(false);
  });
});
