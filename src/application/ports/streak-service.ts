import type {
  TeamSeasonRanking,
  Streak,
  StreakSummary,
} from '../../models/types.js';

export interface StreakService {
  analyseTeamStreaks(ranking: TeamSeasonRanking): Streak[];
  buildStreakSummary(streaks: Streak[]): StreakSummary;
}
