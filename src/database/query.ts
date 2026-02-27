/**
 * Fluent query builder for fixtures
 */

import type { Fixture } from '../models/fixture.js';
import type { QueryFilters } from '../models/types.js';
import {
  getAllFixtures,
  getFixturesByYear,
  getFixturesByTeam,
  getFixturesByYearTeam,
} from './store.js';

/**
 * Fluent query builder class
 */
export class FixtureQuery {
  private filters: QueryFilters = {};

  /**
   * Filter by year
   */
  year(y: number): this {
    this.filters.year = y;
    return this;
  }

  /**
   * Filter by team code
   */
  team(code: string): this {
    this.filters.team = code.toUpperCase();
    return this;
  }

  /**
   * Filter by exact round
   */
  round(r: number): this {
    this.filters.round = r;
    return this;
  }

  /**
   * Filter by round range (inclusive)
   */
  roundRange(start: number, end: number): this {
    this.filters.roundStart = start;
    this.filters.roundEnd = end;
    return this;
  }

  /**
   * Filter to home games only
   */
  homeOnly(): this {
    this.filters.homeOnly = true;
    this.filters.awayOnly = false;
    return this;
  }

  /**
   * Filter to away games only
   */
  awayOnly(): this {
    this.filters.awayOnly = true;
    this.filters.homeOnly = false;
    return this;
  }

  /**
   * Filter to bye weeks only
   */
  byesOnly(): this {
    this.filters.byesOnly = true;
    return this;
  }

  /**
   * Filter by opponent team code
   */
  opponent(code: string): this {
    this.filters.opponent = code.toUpperCase();
    return this;
  }

  /**
   * Get the current filters
   */
  getFilters(): QueryFilters {
    return { ...this.filters };
  }

  /**
   * Execute the query and return matching fixtures
   */
  execute(): Fixture[] {
    let fixtures: Fixture[];

    // Use the most specific index available
    if (this.filters.year && this.filters.team) {
      fixtures = getFixturesByYearTeam(this.filters.year, this.filters.team);
    } else if (this.filters.year) {
      fixtures = getFixturesByYear(this.filters.year);
    } else if (this.filters.team) {
      fixtures = getFixturesByTeam(this.filters.team);
    } else {
      fixtures = getAllFixtures();
    }

    // Apply additional filters
    return fixtures.filter(fixture => this.matchesFilters(fixture));
  }

  /**
   * Check if a fixture matches all active filters
   */
  private matchesFilters(fixture: Fixture): boolean {
    // Round filter
    if (this.filters.round !== undefined && fixture.round !== this.filters.round) {
      return false;
    }

    // Round range filter
    if (this.filters.roundStart !== undefined && fixture.round < this.filters.roundStart) {
      return false;
    }
    if (this.filters.roundEnd !== undefined && fixture.round > this.filters.roundEnd) {
      return false;
    }

    // Home/away filter
    if (this.filters.homeOnly && !fixture.isHome) {
      return false;
    }
    if (this.filters.awayOnly && fixture.isHome) {
      return false;
    }

    // Byes filter
    if (this.filters.byesOnly && !fixture.isBye) {
      return false;
    }

    // Opponent filter
    if (this.filters.opponent && fixture.opponentCode !== this.filters.opponent) {
      return false;
    }

    return true;
  }
}

/**
 * Create a new query builder instance
 */
export function fixtures(): FixtureQuery {
  return new FixtureQuery();
}
