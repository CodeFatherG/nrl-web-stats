import type { GetTeamStrengthRankingsUseCase } from './get-team-strength-rankings.js';
import type { StreakService } from '../ports/streak-service.js';
import type { StreakAnalysisResult } from '../results/streak-analysis-result.js';
import { streakServiceAdapter } from '../adapters/streak-service-adapter.js';
import { getTeamByCode } from '../../database/store.js';

export class AnalyseStreaksUseCase {
  constructor(
    private readonly rankings: GetTeamStrengthRankingsUseCase,
    private readonly streakSvc: StreakService,
  ) {}

  async execute(year: number, teamCode: string): Promise<StreakAnalysisResult | null> {
    const team = getTeamByCode(teamCode);
    if (!team) return null;

    const ranking = await this.rankings.getSeasonRanking(year, teamCode);
    if (!ranking) return null;

    const streaks = this.streakSvc.analyseTeamStreaks(ranking);
    const summary = this.streakSvc.buildStreakSummary(streaks);

    return {
      teamCode,
      teamName: team.name,
      year,
      streaks,
      summary,
    };
  }
}

export function createAnalyseStreaksUseCase(
  rankings: GetTeamStrengthRankingsUseCase,
): AnalyseStreaksUseCase {
  return new AnalyseStreaksUseCase(rankings, streakServiceAdapter);
}
