import type { FixtureRepository } from '../ports/fixture-repository.js';
import {
  getFixturesByYear,
  getFixturesByTeam,
  getFixturesByRound,
  getFixturesByYearTeam,
  isYearLoaded,
  getLoadedYears,
  getAllTeamsFromDb,
  getTeamByCode,
  getLastScrapeTimes,
  getTotalFixtureCount,
  loadFixtures,
} from '../../database/store.js';

export const fixtureRepositoryAdapter: FixtureRepository = {
  findByYear: (year) => getFixturesByYear(year),
  findByTeam: (teamCode) => getFixturesByTeam(teamCode),
  findByRound: (year, round) => getFixturesByRound(year, round),
  findByYearAndTeam: (year, teamCode) => getFixturesByYearTeam(year, teamCode),
  isYearLoaded: (year) => isYearLoaded(year),
  getLoadedYears: () => getLoadedYears(),
  getAllTeams: () => getAllTeamsFromDb(),
  getTeamByCode: (code) => getTeamByCode(code),
  getLastScrapeTimes: () => getLastScrapeTimes(),
  getTotalFixtureCount: () => getTotalFixtureCount(),
  loadFixtures: (year, fixtures) => loadFixtures(year, fixtures),
};
