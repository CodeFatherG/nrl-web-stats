import type { RankingService } from '../ports/ranking-service.js';
import {
  getTeamRoundRanking,
  getTeamSeasonRanking,
  getAllTeamSeasonRankings,
  calculateSeasonThresholds,
} from '../../database/rankings.js';

export const rankingServiceAdapter: RankingService = {
  getTeamRoundRanking: (year, teamCode, round) => getTeamRoundRanking(year, teamCode, round),
  getTeamSeasonRanking: (year, teamCode) => getTeamSeasonRanking(year, teamCode),
  getAllTeamSeasonRankings: (year) => getAllTeamSeasonRankings(year),
  calculateSeasonThresholds: (year) => calculateSeasonThresholds(year),
};
