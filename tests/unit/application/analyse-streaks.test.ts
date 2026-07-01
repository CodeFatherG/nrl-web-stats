import { describe, it, expect } from 'vitest';
import { AnalyseStreaksUseCase } from '../../../src/application/use-cases/analyse-streaks.js';
import type { GetTeamStrengthRankingsUseCase } from '../../../src/application/use-cases/get-team-strength-rankings.js';
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

function createMockRankings(hasRanking: boolean): GetTeamStrengthRankingsUseCase {
  return {
    getSeasonThresholds: async () => null,
    getRoundRanking: async () => null,
    getSeasonRanking: async () => (hasRanking ? (mockRanking as never) : null),
    getAllSeasonRankings: async () => null,
  } as unknown as GetTeamStrengthRankingsUseCase;
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
      createMockRankings(true),
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
      createMockRankings(true),
      createMockStreakService(),
    );
    expect(await useCase.execute(2025, 'XXX')).toBeNull();
  });

  it('returns null when no ranking data exists', async () => {
    const useCase = new AnalyseStreaksUseCase(
      createMockRankings(false),
      createMockStreakService(),
    );
    expect(await useCase.execute(2025, 'MNL')).toBeNull();
  });
});
