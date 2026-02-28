import type {
  TeamRoundRanking,
  TeamSeasonRanking,
  SeasonThresholds,
} from '../../models/types.js';

export interface RankingService {
  getTeamRoundRanking(year: number, teamCode: string, round: number): TeamRoundRanking | null;
  getTeamSeasonRanking(year: number, teamCode: string): TeamSeasonRanking | null;
  getAllTeamSeasonRankings(year: number): Array<{ teamCode: string; ranking: TeamSeasonRanking; rank: number }>;
  calculateSeasonThresholds(year: number): SeasonThresholds;
}
