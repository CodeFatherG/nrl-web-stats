import type { StrengthCategory, SeasonThresholds } from '../../models/types.js';

export interface ScheduleFixture {
  round: number;
  year: number;
  opponent: string | null;
  isHome: boolean;
  isBye: boolean;
  strengthRating: number;
  category: StrengthCategory;
}

export interface TeamScheduleResult {
  teamCode: string;
  teamName: string;
  schedule: ScheduleFixture[];
  totalStrength: number;
  byeRounds: number[];
  thresholds: SeasonThresholds | undefined;
}
