import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapePlayerStatsUseCase } from '../../src/application/use-cases/scrape-player-stats.js';
import type { PlayerStatsSource, PlayerMatchStats } from '../../src/domain/ports/player-stats-source.js';
import type { PlayerRepository, SeasonAggregates } from '../../src/domain/repositories/player-repository.js';
import type { Player, MatchPerformance } from '../../src/domain/player.js';
import type { Result } from '../../src/domain/result.js';

function createMockPlayerStats(overrides: Partial<PlayerMatchStats> = {}): PlayerMatchStats {
  return {
    playerId: '1001',
    playerName: 'Test Player',
    teamCode: 'CBR',
    dateOfBirth: null,
    position: 'Fullback',
    matchId: 'match-1',
    year: 2025,
    round: 1,
    tries: 1,
    goals: 2,
    tackles: 20,
    runMetres: 100,
    fantasyPoints: 45,
    isComplete: true,
    ...overrides,
  };
}

function createMockSource(result: Result<PlayerMatchStats[]>): PlayerStatsSource {
  return {
    fetchPlayerStats: vi.fn().mockResolvedValue(result),
  };
}

function createMockRepository(): PlayerRepository & {
  savedPlayers: Player[];
} {
  const savedPlayers: Player[] = [];
  return {
    savedPlayers,
    save: vi.fn().mockImplementation(async (player: Player) => {
      const idx = savedPlayers.findIndex(p => p.id === player.id);
      if (idx >= 0) savedPlayers[idx] = player;
      else savedPlayers.push(player);
    }),
    findById: vi.fn().mockResolvedValue(null),
    findByTeam: vi.fn().mockResolvedValue([]),
    findMatchPerformances: vi.fn().mockResolvedValue([]),
    findSeasonAggregates: vi.fn().mockResolvedValue(null),
    isRoundComplete: vi.fn().mockResolvedValue(false),
    countDistinctMatchesInRound: vi.fn().mockResolvedValue(0),
    findPerformancesByMatch: vi.fn().mockResolvedValue([]),
  };
}

describe('ScrapePlayerStatsUseCase', () => {
  let mockSource: PlayerStatsSource;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let useCase: ScrapePlayerStatsUseCase;

  beforeEach(() => {
    mockRepo = createMockRepository();
  });

  describe('successful scrape', () => {
    it('processes all players from source and persists them', async () => {
      const stats = [
        createMockPlayerStats({ playerId: '1001', playerName: 'Player A' }),
        createMockPlayerStats({ playerId: '1002', playerName: 'Player B' }),
      ];
      mockSource = createMockSource({ success: true, data: stats, warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1);

      expect(result.playersProcessed).toBe(2);
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
    });

    it('counts unique matches scraped', async () => {
      const stats = [
        createMockPlayerStats({ playerId: '1001', matchId: 'match-1' }),
        createMockPlayerStats({ playerId: '1002', matchId: 'match-1' }),
        createMockPlayerStats({ playerId: '1003', matchId: 'match-2' }),
      ];
      mockSource = createMockSource({ success: true, data: stats, warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1);

      expect(result.matchesScraped).toBe(2);
    });

    it('updates existing player instead of creating new one', async () => {
      const existingPlayer: Player = {
        id: '1001',
        name: 'Old Name',
        dateOfBirth: null,
        teamCode: 'CBR',
        position: 'Halfback',
        performances: [],
      };
      vi.mocked(mockRepo.findById).mockResolvedValue(existingPlayer);

      const stats = [createMockPlayerStats({ playerId: '1001', playerName: 'New Name', position: 'Fullback' })];
      mockSource = createMockSource({ success: true, data: stats, warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);

      const savedPlayer = mockRepo.savedPlayers[0];
      expect(savedPlayer.name).toBe('New Name');
      expect(savedPlayer.position).toBe('Fullback');
      expect(savedPlayer.performances).toHaveLength(1);
    });

    it('returns year and round in result', async () => {
      mockSource = createMockSource({ success: true, data: [], warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 3);

      expect(result.year).toBe(2025);
      expect(result.round).toBe(3);
    });

    it('passes through warnings from source', async () => {
      const warnings = [{ type: 'UNMAPPED_TEAM', message: 'test warning', context: {} }];
      mockSource = createMockSource({ success: true, data: [], warnings });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1);

      expect(result.warnings).toEqual(warnings);
    });
  });

  describe('idempotent behaviour', () => {
    it('skips completed rounds unless force is true', async () => {
      vi.mocked(mockRepo.isRoundComplete).mockResolvedValue(true);
      mockSource = createMockSource({ success: true, data: [], warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1);

      expect(result.skipped).toBe(1);
      expect(result.playersProcessed).toBe(0);
      expect(mockSource.fetchPlayerStats).not.toHaveBeenCalled();
    });

    it('re-scrapes completed rounds when force is true', async () => {
      vi.mocked(mockRepo.isRoundComplete).mockResolvedValue(true);
      const stats = [createMockPlayerStats()];
      mockSource = createMockSource({ success: true, data: stats, warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1, true);

      expect(result.skipped).toBe(0);
      expect(result.playersProcessed).toBe(1);
      expect(mockSource.fetchPlayerStats).toHaveBeenCalledWith(2025, 1);
    });

    it('re-saving same player updates not duplicates (upsert via save)', async () => {
      // First scrape
      const stats = [createMockPlayerStats({ playerId: '1001', tries: 1 })];
      mockSource = createMockSource({ success: true, data: stats, warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      await useCase.execute(2025, 1);
      expect(mockRepo.savedPlayers).toHaveLength(1);

      // Second scrape - existing player found
      vi.mocked(mockRepo.findById).mockResolvedValue(mockRepo.savedPlayers[0]);
      vi.mocked(mockRepo.isRoundComplete).mockResolvedValue(false);
      const stats2 = [createMockPlayerStats({ playerId: '1001', tries: 2 })];
      const source2 = createMockSource({ success: true, data: stats2, warnings: [] });
      const useCase2 = new ScrapePlayerStatsUseCase(source2, mockRepo);

      await useCase2.execute(2025, 1);

      // Should still have 1 player (upserted), not 2
      expect(mockRepo.savedPlayers).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('throws when source returns failure', async () => {
      mockSource = createMockSource({ success: false, error: 'Network error' });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      await expect(useCase.execute(2025, 1)).rejects.toThrow('Failed to fetch player stats');
    });

    it('handles empty stats from source gracefully', async () => {
      mockSource = createMockSource({ success: true, data: [], warnings: [] });
      useCase = new ScrapePlayerStatsUseCase(mockSource, mockRepo);

      const result = await useCase.execute(2025, 1);

      expect(result.playersProcessed).toBe(0);
      expect(result.matchesScraped).toBe(0);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });
  });
});
