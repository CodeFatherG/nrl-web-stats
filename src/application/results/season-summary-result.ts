import type { SeasonThresholds } from '../../models/types.js';

export interface MatchPairing {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  scheduledTime: string | null;
  isComplete: boolean;
  homeStrength: number;
  awayStrength: number;
}

export interface RoundSummary {
  round: number;
  matches: MatchPairing[];
  byeTeams: string[];
}

export interface SeasonSummaryResult {
  year: number;
  thresholds: SeasonThresholds;
  rounds: RoundSummary[];
}
