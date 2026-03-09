import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { D1MatchRepository } from '../../src/infrastructure/persistence/d1-match-repository.js';
import type { Match } from '../../src/domain/match.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { D1Database } from '@cloudflare/workers-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createTestMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: '2025-R1-CBR-SYD',
    year: 2025,
    round: 1,
    homeTeamCode: 'CBR',
    awayTeamCode: 'SYD',
    homeStrengthRating: null,
    awayStrengthRating: null,
    homeScore: null,
    awayScore: null,
    status: 'Scheduled',
    scheduledTime: null,
    stadium: null,
    weather: null,
    ...overrides,
  };
}

describe('D1MatchRepository', () => {
  let mf: Miniflare;
  let db: D1Database;
  let repo: D1MatchRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });

    db = (await mf.getD1Database('DB')) as unknown as D1Database;

    // Apply both migrations
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    for (const file of ['0001_create_player_tables.sql', '0002_create_matches_table.sql', '0003_add_strength_ratings.sql']) {
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

    repo = new D1MatchRepository(db);
  });

  describe('save and findById', () => {
    it('should insert a new match and retrieve it', async () => {
      const match = createTestMatch({ stadium: 'GIO Stadium', homeStrengthRating: 5.2, awayStrengthRating: 3.8 });
      await repo.save(match);

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('2025-R1-CBR-SYD');
      expect(found!.homeTeamCode).toBe('CBR');
      expect(found!.awayTeamCode).toBe('SYD');
      expect(found!.status).toBe('Scheduled');
      expect(found!.stadium).toBe('GIO Stadium');
      expect(found!.homeStrengthRating).toBe(5.2);
      expect(found!.awayStrengthRating).toBe(3.8);
    });

    it('should return null for non-existent match', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('upsert behavior', () => {
    it('should update a Scheduled match with result data', async () => {
      await repo.save(createTestMatch({ status: 'Scheduled' }));
      await repo.save(
        createTestMatch({
          homeScore: 24,
          awayScore: 18,
          status: 'Completed',
          weather: 'Fine',
        })
      );

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found!.homeScore).toBe(24);
      expect(found!.awayScore).toBe(18);
      expect(found!.status).toBe('Completed');
      expect(found!.weather).toBe('Fine');
    });

    it('should NOT overwrite scores/status/weather on a Completed match', async () => {
      await repo.save(
        createTestMatch({
          homeScore: 24,
          awayScore: 18,
          status: 'Completed',
          weather: 'Fine',
        })
      );

      // Attempt to overwrite with different data
      await repo.save(
        createTestMatch({
          homeScore: 30,
          awayScore: 10,
          status: 'Scheduled',
          weather: 'Rainy',
        })
      );

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found!.homeScore).toBe(24);
      expect(found!.awayScore).toBe(18);
      expect(found!.status).toBe('Completed');
      expect(found!.weather).toBe('Fine');
    });

    it('should fill null schedule fields on a Completed match', async () => {
      await repo.save(
        createTestMatch({
          homeScore: 24,
          awayScore: 18,
          status: 'Completed',
          scheduledTime: null,
          stadium: null,
        })
      );

      // Save again with schedule data
      await repo.save(
        createTestMatch({
          homeScore: 24,
          awayScore: 18,
          status: 'Completed',
          scheduledTime: '2025-03-07T19:50:00+11:00',
          stadium: 'GIO Stadium',
        })
      );

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found!.scheduledTime).toBe('2025-03-07T19:50:00+11:00');
      expect(found!.stadium).toBe('GIO Stadium');
      // Scores should remain unchanged
      expect(found!.homeScore).toBe(24);
      expect(found!.status).toBe('Completed');
    });

    it('should NOT overwrite strength ratings on a Completed match', async () => {
      await repo.save(
        createTestMatch({
          homeScore: 24,
          awayScore: 18,
          status: 'Completed',
          homeStrengthRating: 5.0,
          awayStrengthRating: 3.0,
        })
      );

      // Attempt to update ratings on completed match
      await repo.save(
        createTestMatch({
          homeScore: 24,
          awayScore: 18,
          status: 'Completed',
          homeStrengthRating: 9.0,
          awayStrengthRating: 1.0,
        })
      );

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found!.homeStrengthRating).toBe(5.0);
      expect(found!.awayStrengthRating).toBe(3.0);
    });

    it('should update strength ratings on a non-completed match', async () => {
      await repo.save(createTestMatch({ homeStrengthRating: 5.0, awayStrengthRating: 3.0 }));
      await repo.save(createTestMatch({ homeStrengthRating: 7.0, awayStrengthRating: 2.0 }));

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found!.homeStrengthRating).toBe(7.0);
      expect(found!.awayStrengthRating).toBe(2.0);
    });

    it('should enforce forward-only status transitions', async () => {
      await repo.save(createTestMatch({ status: 'InProgress', homeScore: 12, awayScore: 6 }));

      // Attempt to regress to Scheduled
      await repo.save(createTestMatch({ status: 'Scheduled', homeScore: 0, awayScore: 0 }));

      const found = await repo.findById('2025-R1-CBR-SYD');
      expect(found!.status).toBe('InProgress');
    });
  });

  describe('findByYear', () => {
    it('should return all matches for a year', async () => {
      await repo.save(createTestMatch({ id: '2025-R1-CBR-SYD', year: 2025, round: 1 }));
      await repo.save(createTestMatch({ id: '2025-R2-CBR-MEL', year: 2025, round: 2, awayTeamCode: 'MEL' }));
      await repo.save(createTestMatch({ id: '2024-R1-CBR-SYD', year: 2024, round: 1 }));

      const matches = await repo.findByYear(2025);
      expect(matches).toHaveLength(2);
    });

    it('should return empty array for year with no matches', async () => {
      const matches = await repo.findByYear(2099);
      expect(matches).toHaveLength(0);
    });
  });

  describe('findByYearAndRound', () => {
    it('should return matches for a specific round', async () => {
      await repo.save(createTestMatch({ id: '2025-R1-CBR-SYD', round: 1 }));
      await repo.save(createTestMatch({ id: '2025-R1-MEL-PEN', round: 1, homeTeamCode: 'MEL', awayTeamCode: 'PEN' }));
      await repo.save(createTestMatch({ id: '2025-R2-CBR-SYD', round: 2 }));

      const matches = await repo.findByYearAndRound(2025, 1);
      expect(matches).toHaveLength(2);
    });
  });

  describe('findByTeam', () => {
    it('should find matches where team is home or away', async () => {
      await repo.save(createTestMatch({ id: '2025-R1-CBR-SYD', homeTeamCode: 'CBR', awayTeamCode: 'SYD' }));
      await repo.save(createTestMatch({ id: '2025-R2-MEL-CBR', round: 2, homeTeamCode: 'MEL', awayTeamCode: 'CBR' }));
      await repo.save(createTestMatch({ id: '2025-R1-MEL-PEN', homeTeamCode: 'MEL', awayTeamCode: 'PEN' }));

      const matches = await repo.findByTeam('CBR');
      expect(matches).toHaveLength(2);
    });

    it('should filter by year when provided', async () => {
      await repo.save(createTestMatch({ id: '2025-R1-CBR-SYD', year: 2025 }));
      await repo.save(createTestMatch({ id: '2024-R1-CBR-SYD', year: 2024 }));

      const matches = await repo.findByTeam('CBR', 2025);
      expect(matches).toHaveLength(1);
      expect(matches[0].year).toBe(2025);
    });
  });

  describe('saveAll', () => {
    it('should batch insert multiple matches', async () => {
      const matches = [
        createTestMatch({ id: '2025-R1-CBR-SYD', round: 1 }),
        createTestMatch({ id: '2025-R1-MEL-PEN', round: 1, homeTeamCode: 'MEL', awayTeamCode: 'PEN' }),
        createTestMatch({ id: '2025-R2-CBR-MEL', round: 2, awayTeamCode: 'MEL' }),
      ];

      await repo.saveAll(matches);

      const count = await repo.getMatchCount();
      expect(count).toBe(3);
    });
  });

  describe('metadata methods', () => {
    it('getLoadedYears should return sorted distinct years', async () => {
      await repo.save(createTestMatch({ id: '2025-R1-CBR-SYD', year: 2025 }));
      await repo.save(createTestMatch({ id: '2024-R1-CBR-SYD', year: 2024 }));
      await repo.save(createTestMatch({ id: '2025-R2-CBR-MEL', year: 2025, round: 2, awayTeamCode: 'MEL' }));

      const years = await repo.getLoadedYears();
      expect(years).toEqual([2024, 2025]);
    });

    it('isYearLoaded should return true/false correctly', async () => {
      await repo.save(createTestMatch({ year: 2025 }));

      expect(await repo.isYearLoaded(2025)).toBe(true);
      expect(await repo.isYearLoaded(2024)).toBe(false);
    });

    it('getMatchCount should return total count', async () => {
      expect(await repo.getMatchCount()).toBe(0);

      await repo.save(createTestMatch({ id: '2025-R1-CBR-SYD' }));
      await repo.save(createTestMatch({ id: '2025-R2-CBR-MEL', round: 2, awayTeamCode: 'MEL' }));

      expect(await repo.getMatchCount()).toBe(2);
    });
  });
});
