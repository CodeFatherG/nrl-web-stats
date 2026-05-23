import type { RankingService } from '../ports/ranking-service.js';
import type { StreakService } from '../ports/streak-service.js';
import type { StreakAnalysisResult } from '../results/streak-analysis-result.js';
import { rankingServiceAdapter } from '../adapters/ranking-service-adapter.js';
import { streakServiceAdapter } from '../adapters/streak-service-adapter.js';
import { getTeamByCode } from '../../database/store.js';

export class AnalyseStreaksUseCase {
  constructor(
    private readonly rankings: RankingService,
    private readonly streakSvc: StreakService,
  ) {}

  async execute(year: number, teamCode: string): Promise<StreakAnalysisResult | null> {
    const team = getTeamByCode(teamCode);
    if (!team) return null;

    const ranking = await this.rankings.getTeamSeasonRanking(year, teamCode);
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

export function createAnalyseStreaksUseCase(): AnalyseStreaksUseCase {
  return new AnalyseStreaksUseCase(rankingServiceAdapter, streakServiceAdapter);
}
