export interface RoundMatch {
  homeTeam: string;
  awayTeam: string;
  homeStrength: number;
  awayStrength: number;
}

export interface RoundDetailsResult {
  year: number;
  round: number;
  matches: RoundMatch[];
  byeTeams: string[];
}
