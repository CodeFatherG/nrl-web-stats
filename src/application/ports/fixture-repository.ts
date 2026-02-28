import type { Fixture } from '../../models/fixture.js';
import type { Team } from '../../models/team.js';

export interface FixtureRepository {
  findByYear(year: number): Fixture[];
  findByTeam(teamCode: string): Fixture[];
  findByRound(year: number, round: number): Fixture[];
  findByYearAndTeam(year: number, teamCode: string): Fixture[];

  isYearLoaded(year: number): boolean;
  getLoadedYears(): number[];
  getAllTeams(): Team[];
  getTeamByCode(code: string): Team | undefined;
  getLastScrapeTimes(): Record<string, string>;
  getTotalFixtureCount(): number;

  loadFixtures(year: number, fixtures: Fixture[]): void;
}
