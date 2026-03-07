export interface RoundMatch {
  homeTeam: string;
  awayTeam: string;
  homeStrength: number;
  awayStrength: number;
  homeScore: number | null;
  awayScore: number | null;
  scheduledTime: string | null;
  isComplete: boolean;
}

export interface RoundDetailsResult {
  year: number;
  round: number;
  matches: RoundMatch[];
  byeTeams: string[];
}
