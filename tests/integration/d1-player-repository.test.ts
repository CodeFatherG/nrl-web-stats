import { describe, it, expect, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { D1PlayerRepository } from '../../src/infrastructure/persistence/d1-player-repository.js';
import type { Player } from '../../src/domain/player.js';
// In a real scenario, import MatchPerformance from your domain file. 
// For this fix, we use the interface defined at the bottom of the file.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { D1Database } from '@cloudflare/workers-types';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Interface Definitions (as provided) ---

/** MatchPerformance value object — one player's stats for a single match */
export interface MatchPerformance {
  readonly matchId: string;
  readonly year: number;
  readonly round: number;
  readonly teamCode: string;
  readonly allRunMetres: number;
  readonly allRuns: number;
  readonly bombKicks: number;
  readonly crossFieldKicks: number;
  readonly conversions: number;
  readonly conversionAttempts: number;
  readonly dummyHalfRuns: number;
  readonly dummyHalfRunMetres: number;
  readonly dummyPasses: number;
  readonly errors: number;
  readonly fantasyPointsTotal: number;
  readonly fieldGoals: number;
  readonly forcedDropOutKicks: number;
  readonly fortyTwentyKicks: number;
  readonly goals: number;
  readonly goalConversionRate: number;
  readonly grubberKicks: number;
  readonly handlingErrors: number;
  readonly hitUps: number;
  readonly hitUpRunMetres: number;
  readonly ineffectiveTackles: number;
  readonly intercepts: number;
  readonly kicks: number;
  readonly kicksDead: number;
  readonly kicksDefused: number;
  readonly kickMetres: number;
  readonly kickReturnMetres: number;
  readonly lineBreakAssists: number;
  readonly lineBreaks: number;
  readonly lineEngagedRuns: number;
  readonly minutesPlayed: number;
  readonly missedTackles: number;
  readonly offloads: number;
  readonly offsideWithinTenMetres: number;
  readonly oneOnOneLost: number;
  readonly oneOnOneSteal: number;
  readonly onePointFieldGoals: number;
  readonly onReport: number;
  readonly passesToRunRatio: number;
  readonly passes: number;
  readonly playTheBallTotal: number;
  readonly playTheBallAverageSpeed: number;
  readonly penalties: number;
  readonly points: number;
  readonly penaltyGoals: number;
  readonly postContactMetres: number;
  readonly receipts: number;
  readonly ruckInfringements: number;
  readonly sendOffs: number;
  readonly sinBins: number;
  readonly stintOne: number;
  readonly tackleBreaks: number;
  readonly tackleEfficiency: number;
  readonly tacklesMade: number;
  readonly tries: number;
  readonly tryAssists: number;
  readonly twentyFortyKicks: number;
  readonly twoPointFieldGoals: number;
  readonly isComplete: boolean;
}

// --- Test Helpers ---

const DEFAULT_PERFORMANCE: MatchPerformance = {
  matchId: '20251110110',
  year: 2025,
  round: 1,
  teamCode: 'CBR',
  tries: 0,
  goals: 0,
  tacklesMade: 0,
  allRunMetres: 0,
  fantasyPointsTotal: 0,
  isComplete: true,
  // Zero out remaining fields to satisfy interface
  allRuns: 0, bombKicks: 0, crossFieldKicks: 0, conversions: 0, conversionAttempts: 0,
  dummyHalfRuns: 0, dummyHalfRunMetres: 0, dummyPasses: 0, errors: 0, fieldGoals: 0,
  forcedDropOutKicks: 0, fortyTwentyKicks: 0, goalConversionRate: 0, grubberKicks: 0,
  handlingErrors: 0, hitUps: 0, hitUpRunMetres: 0, ineffectiveTackles: 0, intercepts: 0,
  kicks: 0, kicksDead: 0, kicksDefused: 0, kickMetres: 0, kickReturnMetres: 0,
  lineBreakAssists: 0, lineBreaks: 0, lineEngagedRuns: 0, minutesPlayed: 0, missedTackles: 0,
  offloads: 0, offsideWithinTenMetres: 0, oneOnOneLost: 0, oneOnOneSteal: 0, onePointFieldGoals: 0,
  onReport: 0, passesToRunRatio: 0, passes: 0, playTheBallTotal: 0, playTheBallAverageSpeed: 0,
  penalties: 0, points: 0, penaltyGoals: 0, postContactMetres: 0, receipts: 0, ruckInfringements: 0,
  sendOffs: 0, sinBins: 0, stintOne: 0, tackleBreaks: 0, tackleEfficiency: 0, tryAssists: 0,
  twentyFortyKicks: 0, twoPointFieldGoals: 0
};

function createTestPerformance(overrides: Partial<MatchPerformance> = {}): MatchPerformance {
  return {
    ...DEFAULT_PERFORMANCE,
    ...overrides,
  };
}

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

// --- Tests ---

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

    // Cast to unknown then D1Database because Miniflare types might slightly differ from workers-types
    db = await mf.getD1Database('DB') as unknown as D1Database;

    // Apply migration statements individually via batch
    const migrationPath = path.resolve(__dirname, '../../migrations/0001_create_player_tables.sql');
    
    // Ensure the migration file actually exists or mock it for this example context if needed
    if (fs.existsSync(migrationPath)) {
      const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
      const statements = migrationSql
        .split(/;\s*\n/)
        .map(s => s.replace(/--.*$/gm, '').trim())
        .filter(s => s.length > 0);
      const prepared = statements.map(s => db.prepare(s));
      await db.batch(prepared);
    } else {
        // Fallback for standalone execution if file missing
        console.warn("Migration file not found, creating mocked schema");
        await db.exec(`
            CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT, team_code TEXT, position TEXT);
            CREATE TABLE IF NOT EXISTS performances (
                match_id TEXT PRIMARY KEY, player_id TEXT, year INTEGER, round INTEGER, team_code TEXT,
                tries INTEGER, goals INTEGER, tackles_made INTEGER, all_run_metres INTEGER, fantasy_points_total REAL,
                is_complete INTEGER
            );
        `);
    }

    repo = new D1PlayerRepository(db);
  });

  describe('save and findById', () => {
    it('saves a new player and retrieves by ID', async () => {
      const player = createTestPlayer({
        performances: [createTestPerformance({
            tries: 1,
            fantasyPointsTotal: 35.5
        })],
      });

      await repo.save(player);

      const found = await repo.findById('507846');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('507846');
      expect(found!.name).toBe('Kaeo Weekes');
      expect(found!.teamCode).toBe('CBR');
      expect(found!.position).toBe('Fullback');
      expect(found!.performances).toHaveLength(1);
      
      // Updated assertions to match Interface keys
      expect(found!.performances[0].tries).toBe(1);
      expect(found!.performances[0].fantasyPointsTotal).toBe(35.5);
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
          createTestPerformance({ 
            round: 1, matchId: '20251110110', tries: 2, goals: 1, tacklesMade: 10, allRunMetres: 100, fantasyPointsTotal: 50 
          }),
          createTestPerformance({ 
            round: 2, matchId: '20251110210', tries: 1, goals: 3, tacklesMade: 8, allRunMetres: 80, fantasyPointsTotal: 40 
          }),
        ],
      }));

      const agg = await repo.findSeasonAggregates('507846', 2025);
      expect(agg).not.toBeNull();
      expect(agg!.matchesPlayed).toBe(2);
      expect(agg!.totalTries).toBe(3);
      expect(agg!.totalGoals).toBe(4);
      expect(agg!.totalTackles).toBe(18); // Assuming aggregator maps tacklesMade -> totalTackles
      expect(agg!.totalRunMetres).toBe(180); // Assuming aggregator maps allRunMetres -> totalRunMetres
      expect(agg!.totalFantasyPoints).toBe(90); // Assuming aggregator maps fantasyPointsTotal -> totalFantasyPoints
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