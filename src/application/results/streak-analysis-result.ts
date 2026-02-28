import type { Streak, StreakSummary } from '../../models/types.js';

export interface StreakAnalysisResult {
  teamCode: string;
  teamName: string;
  year: number;
  streaks: Streak[];
  summary: StreakSummary;
}
