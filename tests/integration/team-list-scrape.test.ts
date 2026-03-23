/**
 * Integration tests for ScrapeTeamListsUseCase (T017, T024, T029)
 * Tests: initial scrape, team list replacement, and backfill logic
 * Uses mock TeamListSource + real D1 repos via Miniflare
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { D1TeamListRepository } from '../../src/infrastructure/persistence/d1-team-list-repository.js';
import { D1MatchRepository } from '../../src/infrastructure/persistence/d1-match-repository.js';
import { ScrapeTeamListsUseCase } from '../../src/application/use-cases/scrape-team-lists.js';
import type { TeamListSource } from '../../src/domain/ports/team-list-source.js';
import type { TeamList } from '../../src/domain/team-list.js';
import { createTeamList } from '../../src/domain/team-list.js';
import type { Match } from '../../src/domain/match.js';
import { MatchStatus } from '../../src/domain/match.js';
import { success, failure } from '../../src/domain/result.js';
import type { D1Database } from '@cloudflare/workers-types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMembers(count: number = 17) {
  return Array.from({ length: count }, (_, i) => ({
    jerseyNumber: i + 1,
    playerName: `Player ${i + 1}`,
    position: i < 13 ? 'Forward' : 'Interchange',
    playerId: 1000 + i,
  }));
}

function makeTeamList(overrides: Partial<TeamList> & { matchId: string; teamCode: string }): TeamList {
  return createTeamList({
    year: 2026,
    round: 5,
    members: makeMembers(),
    scrapedAt: '2026-03-31T06:00:00Z',
    ...overrides,
  });
}

function createTestMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: '2026-R5-BRO-MEL',
    year: 2026,
    round: 5,
    homeTeamCode: 'BRO',
    awayTeamCode: 'MEL',
    homeStrengthRating: null,
    awayStrengthRating: null,
    homeScore: null,
    awayScore: null,
    status: MatchStatus.Scheduled,
    scheduledTime: null,
    stadium: null,
    weather: null,
    ...overrides,
  };
}

/** Create a mock TeamListSource that returns predefined results */
function createMockSource(teamLists: TeamList[]): TeamListSource {
  return {
    fetchTeamLists: async () => success(teamLists),
    fetchTeamListForMatch: async () => success(teamLists),
  };
}

function createFailingSource(): TeamListSource {
  return {
    fetchTeamLists: async () => failure('Network error'),
    fetchTeamListForMatch: async () => failure('Network error'),
  };
}

async function applyMigrations(db: D1Database) {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationFiles = [
    '0001_create_player_tables.sql',
    '0002_create_matches_table.sql',
    '0003_add_strength_ratings.sql',
    '0009_create_team_lists.sql',
  ];

  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const statements = sql
        .split(/;\s*\n/)
        .map((s) => s.replace(/--.*$/gm, '').trim())
        .filter((s) => s.length > 0);
      const prepared = statements.map((s) => db.prepare(s));
      await db.batch(prepared);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScrapeTeamListsUseCase integration', () => {
  let mf: Miniflare;
  let db: D1Database;
  let teamListRepo: D1TeamListRepository;
  let matchRepo: D1MatchRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });

    db = (await mf.getD1Database('DB')) as unknown as D1Database;
    await applyMigrations(db);

    teamListRepo = new D1TeamListRepository(db);
    matchRepo = new D1MatchRepository(db);
  });

  // -----------------------------------------------------------------------
  // T017: Initial round scrape
  // -----------------------------------------------------------------------

  describe('execute (initial round scrape)', () => {
    it('scrapes and persists team lists for a round', async () => {
      const match = createTestMatch();
      await matchRepo.save(match);

      const homeList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      const awayList = makeTeamList({ matchId: match.id, teamCode: 'MEL' });
      const source = createMockSource([homeList, awayList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.execute(2026, 5);

      expect(result.success).toBe(true);
      expect(result.scrapedCount).toBe(2);
      expect(result.skippedCount).toBe(0);

      const stored = await teamListRepo.findByMatch(match.id);
      expect(stored).toHaveLength(2);
      expect(stored.find((tl) => tl.teamCode === 'BRO')!.members).toHaveLength(17);
      expect(stored.find((tl) => tl.teamCode === 'MEL')!.members).toHaveLength(17);
    });

    it('returns failure when source fails', async () => {
      const match = createTestMatch();
      await matchRepo.save(match);

      const source = createFailingSource();
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.execute(2026, 5);

      expect(result.success).toBe(false);
      expect(result.scrapedCount).toBe(0);
    });

    it('returns empty result when no team lists available', async () => {
      const match = createTestMatch();
      await matchRepo.save(match);

      const source = createMockSource([]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.execute(2026, 5);

      expect(result.success).toBe(true);
      expect(result.scrapedCount).toBe(0);
    });

    it('skips completed matches that already have team lists', async () => {
      const match = createTestMatch({ status: MatchStatus.Completed, homeScore: 24, awayScore: 18 });
      await matchRepo.save(match);

      // Pre-populate team list
      const existingList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      await teamListRepo.save(existingList);

      // Source returns both home and away lists
      const homeList = makeTeamList({ matchId: match.id, teamCode: 'BRO', scrapedAt: '2026-04-01T00:00:00Z' });
      const awayList = makeTeamList({ matchId: match.id, teamCode: 'MEL' });
      const source = createMockSource([homeList, awayList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.execute(2026, 5);

      expect(result.scrapedCount).toBe(1); // away saved
      expect(result.skippedCount).toBe(1); // home skipped (already exists for completed match)
    });
  });

  // -----------------------------------------------------------------------
  // T024: Team list replacement (window-based update)
  // -----------------------------------------------------------------------

  describe('scrapeMatchesInWindow (replacement)', () => {
    it('replaces existing team lists for matches in update window', async () => {
      const kickoff = new Date('2026-04-05T08:00:00Z');
      const match = createTestMatch({
        status: MatchStatus.Scheduled,
        scheduledTime: kickoff.toISOString(),
      });
      await matchRepo.save(match);

      // Save initial team list
      const initialList = makeTeamList({
        matchId: match.id,
        teamCode: 'BRO',
        scrapedAt: '2026-04-01T06:00:00Z',
      });
      await teamListRepo.save(initialList);

      // Verify initial data stored
      const before = await teamListRepo.findByMatch(match.id);
      expect(before).toHaveLength(1);
      expect(before[0].scrapedAt).toBe('2026-04-01T06:00:00Z');

      // Updated team list with different scrapedAt
      const updatedList = makeTeamList({
        matchId: match.id,
        teamCode: 'BRO',
        scrapedAt: '2026-04-04T08:00:00Z',
      });
      const source = createMockSource([updatedList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      // Current time is 23 hours before kickoff (within 24h window)
      const now = new Date(kickoff.getTime() - 23 * 60 * 60 * 1000);
      const result = await useCase.scrapeMatchesInWindow(2026, 24 * 60 * 60 * 1000, now);

      expect(result.success).toBe(true);
      expect(result.scrapedCount).toBe(1);

      // Verify replacement
      const after = await teamListRepo.findByMatch(match.id);
      expect(after).toHaveLength(1);
      expect(after[0].scrapedAt).toBe('2026-04-04T08:00:00Z');
    });

    it('does not scrape matches outside the window', async () => {
      const kickoff = new Date('2026-04-05T08:00:00Z');
      const match = createTestMatch({
        status: MatchStatus.Scheduled,
        scheduledTime: kickoff.toISOString(),
      });
      await matchRepo.save(match);

      const teamList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      const source = createMockSource([teamList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      // Current time is 48 hours before kickoff (outside 24h window)
      const now = new Date(kickoff.getTime() - 48 * 60 * 60 * 1000);
      const result = await useCase.scrapeMatchesInWindow(2026, 24 * 60 * 60 * 1000, now);

      expect(result.scrapedCount).toBe(0);
      const stored = await teamListRepo.findByMatch(match.id);
      expect(stored).toHaveLength(0);
    });

    it('skips completed matches even within window', async () => {
      const kickoff = new Date('2026-04-05T08:00:00Z');
      const match = createTestMatch({
        status: MatchStatus.Completed,
        scheduledTime: kickoff.toISOString(),
        homeScore: 24,
        awayScore: 12,
      });
      await matchRepo.save(match);

      const teamList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      const source = createMockSource([teamList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      // Within window, but match is completed
      const now = new Date(kickoff.getTime() - 1 * 60 * 60 * 1000);
      const result = await useCase.scrapeMatchesInWindow(2026, 24 * 60 * 60 * 1000, now);

      expect(result.scrapedCount).toBe(0);
    });

    it('handles 90-minute window boundary correctly', async () => {
      const kickoff = new Date('2026-04-05T08:00:00Z');
      const match = createTestMatch({
        status: MatchStatus.Scheduled,
        scheduledTime: kickoff.toISOString(),
      });
      await matchRepo.save(match);

      const teamList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      const source = createMockSource([teamList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const NINETY_MIN = 90 * 60 * 1000;

      // Exactly at 90min boundary - should be included
      const atBoundary = new Date(kickoff.getTime() - NINETY_MIN);
      const result1 = await useCase.scrapeMatchesInWindow(2026, NINETY_MIN, atBoundary);
      expect(result1.scrapedCount).toBe(1);

      // Just outside 90min boundary - should be excluded
      const outside = new Date(kickoff.getTime() - NINETY_MIN - 1);
      const result2 = await useCase.scrapeMatchesInWindow(2026, NINETY_MIN, outside);
      expect(result2.scrapedCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // T029: Backfill completed matches
  // -----------------------------------------------------------------------

  describe('backfillCompleted', () => {
    it('populates team lists for completed matches missing data', async () => {
      const match = createTestMatch({
        status: MatchStatus.Completed,
        homeScore: 24,
        awayScore: 18,
      });
      await matchRepo.save(match);

      // No team lists exist yet
      const before = await teamListRepo.findByMatch(match.id);
      expect(before).toHaveLength(0);

      const homeList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      const awayList = makeTeamList({ matchId: match.id, teamCode: 'MEL' });
      const source = createMockSource([homeList, awayList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.backfillCompleted(2026);

      expect(result.success).toBe(true);
      expect(result.backfilledCount).toBe(2);

      const after = await teamListRepo.findByMatch(match.id);
      expect(after).toHaveLength(2);
    });

    it('skips completed matches that already have team lists', async () => {
      const match = createTestMatch({
        status: MatchStatus.Completed,
        homeScore: 24,
        awayScore: 18,
      });
      await matchRepo.save(match);

      // Pre-populate both team lists
      await teamListRepo.save(makeTeamList({ matchId: match.id, teamCode: 'BRO' }));
      await teamListRepo.save(makeTeamList({ matchId: match.id, teamCode: 'MEL' }));

      const source = createMockSource([
        makeTeamList({ matchId: match.id, teamCode: 'BRO', scrapedAt: '2026-04-02T00:00:00Z' }),
        makeTeamList({ matchId: match.id, teamCode: 'MEL', scrapedAt: '2026-04-02T00:00:00Z' }),
      ]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.backfillCompleted(2026);

      expect(result.backfilledCount).toBe(0);

      // Verify original data not overwritten
      const stored = await teamListRepo.findByMatch(match.id);
      expect(stored[0].scrapedAt).toBe('2026-03-31T06:00:00Z');
    });

    it('does not backfill scheduled matches', async () => {
      const match = createTestMatch({ status: MatchStatus.Scheduled });
      await matchRepo.save(match);

      const teamList = makeTeamList({ matchId: match.id, teamCode: 'BRO' });
      const source = createMockSource([teamList]);
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.backfillCompleted(2026);

      expect(result.backfilledCount).toBe(0);
      const stored = await teamListRepo.findByMatch(match.id);
      expect(stored).toHaveLength(0);
    });

    it('handles source failure gracefully during backfill', async () => {
      const match = createTestMatch({
        status: MatchStatus.Completed,
        homeScore: 24,
        awayScore: 18,
      });
      await matchRepo.save(match);

      const source = createFailingSource();
      const useCase = new ScrapeTeamListsUseCase(source, teamListRepo, matchRepo);

      const result = await useCase.backfillCompleted(2026);

      expect(result.backfilledCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('BACKFILL_FETCH_FAILED');
    });
  });
});
