/**
 * In-memory database store with indexes
 */

import type { Fixture } from '../models/fixture.js';
import type { Team } from '../models/team.js';
import { TEAM_NAMES, VALID_TEAM_CODES } from '../models/team.js';
import { logger } from '../utils/logger.js';

interface DatabaseState {
  // Primary storage
  teams: Map<string, Team>;
  fixtures: Fixture[];

  // Indexes for fast queries
  byYear: Map<number, Fixture[]>;
  byTeam: Map<string, Fixture[]>;
  byRound: Map<string, Fixture[]>;
  byYearTeam: Map<string, Fixture[]>;

  // Metadata
  loadedYears: Set<number>;
  lastScrape: Map<number, Date>;
}

/** Singleton database instance */
let db: DatabaseState | null = null;

/**
 * Initialize or get the database
 */
export function getDatabase(): DatabaseState {
  if (!db) {
    db = {
      teams: new Map(),
      fixtures: [],
      byYear: new Map(),
      byTeam: new Map(),
      byRound: new Map(),
      byYearTeam: new Map(),
      loadedYears: new Set(),
      lastScrape: new Map(),
    };

    // Initialize teams from constants
    for (const code of VALID_TEAM_CODES) {
      db.teams.set(code, { code, name: TEAM_NAMES[code] });
    }

    logger.info('Database initialized', { teamCount: db.teams.size });
  }
  return db;
}

/**
 * Load fixtures for a year into the database
 */
export function loadFixtures(year: number, fixtures: Fixture[]): void {
  const database = getDatabase();

  // Remove existing fixtures for this year
  database.fixtures = database.fixtures.filter(f => f.year !== year);

  // Add new fixtures
  database.fixtures.push(...fixtures);

  // Rebuild indexes
  rebuildIndexes();

  // Update metadata
  database.loadedYears.add(year);
  database.lastScrape.set(year, new Date());

  logger.info('Fixtures loaded', {
    year,
    fixtureCount: fixtures.length,
    totalFixtures: database.fixtures.length,
  });
}

/**
 * Rebuild all indexes from fixtures array
 */
function rebuildIndexes(): void {
  const database = getDatabase();

  // Clear existing indexes
  database.byYear.clear();
  database.byTeam.clear();
  database.byRound.clear();
  database.byYearTeam.clear();

  // Rebuild from fixtures
  for (const fixture of database.fixtures) {
    // By year
    if (!database.byYear.has(fixture.year)) {
      database.byYear.set(fixture.year, []);
    }
    database.byYear.get(fixture.year)!.push(fixture);

    // By team
    if (!database.byTeam.has(fixture.teamCode)) {
      database.byTeam.set(fixture.teamCode, []);
    }
    database.byTeam.get(fixture.teamCode)!.push(fixture);

    // By round (year-round)
    const roundKey = `${fixture.year}-${fixture.round}`;
    if (!database.byRound.has(roundKey)) {
      database.byRound.set(roundKey, []);
    }
    database.byRound.get(roundKey)!.push(fixture);

    // By year-team
    const yearTeamKey = `${fixture.year}-${fixture.teamCode}`;
    if (!database.byYearTeam.has(yearTeamKey)) {
      database.byYearTeam.set(yearTeamKey, []);
    }
    database.byYearTeam.get(yearTeamKey)!.push(fixture);
  }

  logger.debug('Indexes rebuilt', {
    yearCount: database.byYear.size,
    teamCount: database.byTeam.size,
    roundCount: database.byRound.size,
  });
}

/**
 * Get loaded years
 */
export function getLoadedYears(): number[] {
  return Array.from(getDatabase().loadedYears).sort();
}

/**
 * Get last scrape times
 */
export function getLastScrapeTimes(): Record<string, string> {
  const database = getDatabase();
  const result: Record<string, string> = {};
  for (const [year, date] of database.lastScrape) {
    result[year.toString()] = date.toISOString();
  }
  return result;
}

/**
 * Get total fixture count
 */
export function getTotalFixtureCount(): number {
  return getDatabase().fixtures.length;
}

/**
 * Get all fixtures
 */
export function getAllFixtures(): Fixture[] {
  return [...getDatabase().fixtures];
}

/**
 * Get fixtures by year
 */
export function getFixturesByYear(year: number): Fixture[] {
  return getDatabase().byYear.get(year) || [];
}

/**
 * Get fixtures by team
 */
export function getFixturesByTeam(teamCode: string): Fixture[] {
  return getDatabase().byTeam.get(teamCode.toUpperCase()) || [];
}

/**
 * Get fixtures by round
 */
export function getFixturesByRound(year: number, round: number): Fixture[] {
  return getDatabase().byRound.get(`${year}-${round}`) || [];
}

/**
 * Get fixtures by year and team
 */
export function getFixturesByYearTeam(year: number, teamCode: string): Fixture[] {
  return getDatabase().byYearTeam.get(`${year}-${teamCode.toUpperCase()}`) || [];
}

/**
 * Check if a year is loaded
 */
export function isYearLoaded(year: number): boolean {
  return getDatabase().loadedYears.has(year);
}

/**
 * Get all teams
 */
export function getAllTeams(): Team[] {
  return Array.from(getDatabase().teams.values());
}

/**
 * Get team by code
 */
export function getTeamByCode(code: string): Team | undefined {
  return getDatabase().teams.get(code.toUpperCase());
}

/**
 * Reset database (for testing)
 */
export function resetDatabase(): void {
  db = null;
  logger.info('Database reset');
}
