import type { FixtureRepository } from '../ports/fixture-repository.js';
import type { RankingService } from '../ports/ranking-service.js';
import type { StreakService } from '../ports/streak-service.js';
import type { StreakAnalysisResult } from '../results/streak-analysis-result.js';
import { fixtureRepositoryAdapter } from '../adapters/fixture-repository-adapter.js';
import { rankingServiceAdapter } from '../adapters/ranking-service-adapter.js';
import { streakServiceAdapter } from '../adapters/streak-service-adapter.js';

export class AnalyseStreaksUseCase {
  constructor(
    private readonly fixtures: FixtureRepository,
    private readonly rankings: RankingService,
    private readonly streakSvc: StreakService
  ) {}

  execute(year: number, teamCode: string): StreakAnalysisResult | null {
    const team = this.fixtures.getTeamByCode(teamCode);
    if (!team) return null;

    const ranking = this.rankings.getTeamSeasonRanking(year, teamCode);
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
  return new AnalyseStreaksUseCase(fixtureRepositoryAdapter, rankingServiceAdapter, streakServiceAdapter);
}
