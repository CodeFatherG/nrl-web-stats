/**
 * Integration tests for D1PlayerRepository.
 * Uses Miniflare's D1 simulation for realistic database testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { D1PlayerRepository } from '../../src/infrastructure/persistence/d1-player-repository.js';
import type { Player, MatchPerformance } from '../../src/domain/player.js';
import * as fs from 'fs';
import * as path from 'path';

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: '507846',
    name: 'Kaeo Weekes',
    dateOfBirth: null,
    teamCode: 'CBR',
    position: 'Fullback',
    performances: [],
    ...overrides,
  };
}

function createTestPerformance(overrides: Partial<MatchPerformance> = {}): MatchPerformance {
  return {
    matchId: '20251110110',
    year: 2025,
    round: 1,
    teamCode: 'CBR',
    tries: 1,
    goals: 0,
    tackles: 5,
    runMetres: 120,
    fantasyPoints: 35.5,
    isComplete: true,
    ...overrides,
  };
}

describe('D1PlayerRepository', () => {
  let mf: Miniflare;
  let db: D1Database;
  let repo: D1PlayerRepository;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db' },
    });

    db = await mf.getD1Database('DB');

    // Apply migration statements individually via batch
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/0001_create_player_tables.sql'),
      'utf-8'
    );
    const statements = migrationSql
      .split(/;\s*\n/)
      .map(s => s.replace(/--.*$/gm, '').trim())
      .filter(s => s.length > 0);
    const prepared = statements.map(s => db.prepare(s));
    await db.batch(prepared);

    repo = new D1PlayerRepository(db);
  });

  describe('save and findById', () => {
    it('saves a new player and retrieves by ID', async () => {
      const player = createTestPlayer({
        performances: [createTestPerformance()],
      });

      await repo.save(player);

      const found = await repo.findById('507846');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('507846');
      expect(found!.name).toBe('Kaeo Weekes');
      expect(found!.teamCode).toBe('CBR');
      expect(found!.position).toBe('Fullback');
      expect(found!.performances).toHaveLength(1);
      expect(found!.performances[0].tries).toBe(1);
      expect(found!.performances[0].fantasyPoints).toBe(35.5);
    });

    it('returns null for non-existent player', async () => {
      const found = await repo.findById('999999');
      expect(found).toBeNull();
    });

    it('upserts player on re-save (updates team/position, no duplicates)', async () => {
      const player = createTestPlayer({
        performances: [createTestPerformance()],
      });
      await repo.save(player);

      // Same player, different team
      const updated = createTestPlayer({
        teamCode: 'MEL',
        position: 'Centre',
        performances: [createTestPerformance({ matchId: '20251110201', round: 2, teamCode: 'MEL' })],
      });
      await repo.save(updated);

      const found = await repo.findById('507846');
      expect(found).not.toBeNull();
      expect(found!.teamCode).toBe('MEL');
      expect(found!.position).toBe('Centre');
      // Should have both performances
      expect(found!.performances).toHaveLength(2);
    });
  });

  describe('findByTeam', () => {
    it('finds players by team code', async () => {
      await repo.save(createTestPlayer({
        id: '1001',
        name: 'Player One',
        teamCode: 'CBR',
        performances: [createTestPerformance({ teamCode: 'CBR' })],
      }));
      await repo.save(createTestPlayer({
        id: '1002',
        name: 'Player Two',
        teamCode: 'MEL',
        performances: [createTestPerformance({ matchId: '20251110201', teamCode: 'MEL' })],
      }));

      const cbrPlayers = await repo.findByTeam('CBR');
      expect(cbrPlayers).toHaveLength(1);
      expect(cbrPlayers[0].name).toBe('Player One');
    });

    it('filters by season when provided', async () => {
      await repo.save(createTestPlayer({
        performances: [
          createTestPerformance({ year: 2024, matchId: '20241110110' }),
          createTestPerformance({ year: 2025, matchId: '20251110110' }),
        ],
      }));

      const players2025 = await repo.findByTeam('CBR', 2025);
      expect(players2025).toHaveLength(1);
      // Should only have 2025 performances
      expect(players2025[0].performances.every(p => p.year === 2025)).toBe(true);
    });

    it('returns empty array when no players match', async () => {
      const players = await repo.findByTeam('GCT');
      expect(players).toHaveLength(0);
    });
  });

  describe('findMatchPerformances', () => {
    it('returns performances for a player and season ordered by round', async () => {
      await repo.save(createTestPlayer({
        performances: [
          createTestPerformance({ round: 3, matchId: '20251110310' }),
          createTestPerformance({ round: 1, matchId: '20251110110' }),
          createTestPerformance({ round: 2, matchId: '20251110210' }),
        ],
      }));

      const perfs = await repo.findMatchPerformances('507846', 2025);
      expect(perfs).toHaveLength(3);
      expect(perfs[0].round).toBe(1);
      expect(perfs[1].round).toBe(2);
      expect(perfs[2].round).toBe(3);
    });
  });

  describe('findSeasonAggregates', () => {
    it('returns aggregated season statistics', async () => {
      await repo.save(createTestPlayer({
        performances: [
          createTestPerformance({ round: 1, matchId: '20251110110', tries: 2, goals: 1, tackles: 10, runMetres: 100, fantasyPoints: 50 }),
          createTestPerformance({ round: 2, matchId: '20251110210', tries: 1, goals: 3, tackles: 8, runMetres: 80, fantasyPoints: 40 }),
        ],
      }));

      const agg = await repo.findSeasonAggregates('507846', 2025);
      expect(agg).not.toBeNull();
      expect(agg!.matchesPlayed).toBe(2);
      expect(agg!.totalTries).toBe(3);
      expect(agg!.totalGoals).toBe(4);
      expect(agg!.totalTackles).toBe(18);
      expect(agg!.totalRunMetres).toBe(180);
      expect(agg!.totalFantasyPoints).toBe(90);
    });

    it('returns null for player with no performances in season', async () => {
      await repo.save(createTestPlayer());
      const agg = await repo.findSeasonAggregates('507846', 2025);
      expect(agg).toBeNull();
    });
  });

  describe('isRoundComplete', () => {
    it('returns true when all performances in round are complete', async () => {
      await repo.save(createTestPlayer({
        id: '1001',
        performances: [createTestPerformance({ isComplete: true })],
      }));
      await repo.save(createTestPlayer({
        id: '1002',
        name: 'Player Two',
        performances: [createTestPerformance({ isComplete: true })],
      }));

      const complete = await repo.isRoundComplete(2025, 1);
      expect(complete).toBe(true);
    });

    it('returns false when any performance is incomplete', async () => {
      await repo.save(createTestPlayer({
        id: '1001',
        performances: [createTestPerformance({ isComplete: true })],
      }));
      await repo.save(createTestPlayer({
        id: '1002',
        name: 'Player Two',
        performances: [createTestPerformance({ isComplete: false })],
      }));

      const complete = await repo.isRoundComplete(2025, 1);
      expect(complete).toBe(false);
    });

    it('returns false when no performances exist for round', async () => {
      const complete = await repo.isRoundComplete(2025, 99);
      expect(complete).toBe(false);
    });
  });

  describe('idempotent upsert for match performances', () => {
    it('does not overwrite complete records with incomplete data', async () => {
      // First save with complete data
      await repo.save(createTestPlayer({
        performances: [createTestPerformance({ tries: 3, isComplete: true })],
      }));

      // Re-save same match with incomplete data (should be skipped)
      await repo.save(createTestPlayer({
        performances: [createTestPerformance({ tries: 0, isComplete: false })],
      }));

      const perfs = await repo.findMatchPerformances('507846', 2025);
      expect(perfs).toHaveLength(1);
      expect(perfs[0].tries).toBe(3); // Original data preserved
      expect(perfs[0].isComplete).toBe(true);
    });

    it('overwrites incomplete records with complete data', async () => {
      // First save with incomplete data
      await repo.save(createTestPlayer({
        performances: [createTestPerformance({ tries: 1, isComplete: false })],
      }));

      // Re-save same match with complete data
      await repo.save(createTestPlayer({
        performances: [createTestPerformance({ tries: 3, isComplete: true })],
      }));

      const perfs = await repo.findMatchPerformances('507846', 2025);
      expect(perfs).toHaveLength(1);
      expect(perfs[0].tries).toBe(3); // Updated
      expect(perfs[0].isComplete).toBe(true);
    });
  });
});
