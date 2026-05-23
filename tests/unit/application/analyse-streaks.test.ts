import { describe, it, expect } from 'vitest';
import { AnalyseStreaksUseCase } from '../../../src/application/use-cases/analyse-streaks.js';
import type { RankingService } from '../../../src/application/ports/ranking-service.js';
import type { StreakService } from '../../../src/application/ports/streak-service.js';

const mockRanking = {
  totalStrength: 120,
  averageStrength: 5.0,
  percentile: 50,
  category: 'medium' as const,
  roundRankings: [],
};
const mockStreaks = [{ type: 'soft_draw' as const, startRound: 1, endRound: 3, rounds: 3, averageStrength: 3.0 }];
const mockSummary = { softDraws: 1, roughPatches: 0, longestSoftDraw: 3, longestRoughPatch: 0 };

function createMockRankingService(hasRanking: boolean): RankingService {
  return {
    getTeamRoundRanking: async () => null,
    getTeamSeasonRanking: async () => hasRanking ? mockRanking : null,
    getAllTeamSeasonRankings: async () => [],
    calculateSeasonThresholds: async () => ({ soft: 3.5, moderate: 5.0, tough: 6.5, count: 0 } as never),
  };
}

function createMockStreakService(): StreakService {
  return {
    analyseTeamStreaks: () => mockStreaks,
    buildStreakSummary: () => mockSummary,
  };
}

describe('AnalyseStreaksUseCase', () => {
  it('returns streaks and summary for a valid team with ranking', async () => {
    const useCase = new AnalyseStreaksUseCase(
      createMockRankingService(true),
      createMockStreakService(),
    );
    const result = await useCase.execute(2025, 'MNL');
    expect(result).not.toBeNull();
    expect(result!.teamCode).toBe('MNL');
    expect(result!.teamName).toBe('Manly Sea Eagles');
    expect(result!.year).toBe(2025);
    expect(result!.streaks).toEqual(mockStreaks);
    expect(result!.summary).toEqual(mockSummary);
  });

  it('returns null when team not found', async () => {
    const useCase = new AnalyseStreaksUseCase(
      createMockRankingService(true),
      createMockStreakService(),
    );
    expect(await useCase.execute(2025, 'XXX')).toBeNull();
  });

  it('returns null when no ranking data exists', async () => {
    const useCase = new AnalyseStreaksUseCase(
      createMockRankingService(false),
      createMockStreakService(),
    );
    expect(await useCase.execute(2025, 'MNL')).toBeNull();
  });
});
