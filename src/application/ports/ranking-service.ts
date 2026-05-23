import type {
  TeamRoundRanking,
  TeamSeasonRanking,
  SeasonThresholds,
} from '../../models/types.js';

export interface RankingService {
  getTeamRoundRanking(year: number, teamCode: string, round: number): Promise<TeamRoundRanking | null>;
  getTeamSeasonRanking(year: number, teamCode: string): Promise<TeamSeasonRanking | null>;
  getAllTeamSeasonRankings(year: number): Promise<Array<{ teamCode: string; ranking: TeamSeasonRanking; rank: number }>>;
  calculateSeasonThresholds(year: number): Promise<SeasonThresholds>;
}
