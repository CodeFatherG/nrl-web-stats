import type { StreakService } from '../ports/streak-service.js';
import { analyseTeamStreaks, buildStreakSummary } from '../../database/streaks.js';

export const streakServiceAdapter: StreakService = {
  analyseTeamStreaks: (ranking) => analyseTeamStreaks(ranking),
  buildStreakSummary: (streaks) => buildStreakSummary(streaks),
};
