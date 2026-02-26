/**
 * Database module exports
 */

export {
  getDatabase,
  loadFixtures,
  getLoadedYears,
  getLastScrapeTimes,
  getTotalFixtureCount,
  getAllFixtures,
  getFixturesByYear,
  getFixturesByTeam,
  getFixturesByRound,
  getFixturesByYearTeam,
  isYearLoaded,
  getAllTeams,
  getTeamByCode,
  resetDatabase,
} from './store.js';

export { FixtureQuery, fixtures } from './query.js';
