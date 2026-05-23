/**
 * Fluent query builder for fixtures.
 *
 * After spec 038 the no-year branches (`findByTeam`, `findByRound` with no
 * year) are removed — every query must scope to a year. The previous
 * branches had zero production callers; they survived only as fallbacks
 * for the in-RAM index lookups.
 */

import type { Fixture } from '../models/fixture.js';
import type { QueryFilters } from '../models/types.js';
import {
  getFixturesByYear,
  getFixturesByYearTeam,
} from './store.js';

export class FixtureQuery {
  private filters: QueryFilters = {};

  year(y: number): this {
    this.filters.year = y;
    return this;
  }

  team(code: string): this {
    this.filters.team = code.toUpperCase();
    return this;
  }

  round(r: number): this {
    this.filters.round = r;
    return this;
  }

  roundRange(start: number, end: number): this {
    this.filters.roundStart = start;
    this.filters.roundEnd = end;
    return this;
  }

  homeOnly(): this {
    this.filters.homeOnly = true;
    this.filters.awayOnly = false;
    return this;
  }

  awayOnly(): this {
    this.filters.awayOnly = true;
    this.filters.homeOnly = false;
    return this;
  }

  byesOnly(): this {
    this.filters.byesOnly = true;
    return this;
  }

  opponent(code: string): this {
    this.filters.opponent = code.toUpperCase();
    return this;
  }

  getFilters(): QueryFilters {
    return { ...this.filters };
  }

  /** Execute the query and return matching fixtures. `year` is required —
   *  cross-year queries are out of scope. */
  async execute(): Promise<Fixture[]> {
    if (this.filters.year === undefined) {
      throw new Error('FixtureQuery.execute requires a year filter');
    }

    const fixtures = this.filters.team
      ? await getFixturesByYearTeam(this.filters.year, this.filters.team)
      : await getFixturesByYear(this.filters.year);

    return fixtures.filter(fixture => this.matchesFilters(fixture));
  }

  private matchesFilters(fixture: Fixture): boolean {
    if (this.filters.round !== undefined && fixture.round !== this.filters.round) {
      return false;
    }
    if (this.filters.roundStart !== undefined && fixture.round < this.filters.roundStart) {
      return false;
    }
    if (this.filters.roundEnd !== undefined && fixture.round > this.filters.roundEnd) {
      return false;
    }
    if (this.filters.homeOnly && !fixture.isHome) return false;
    if (this.filters.awayOnly && fixture.isHome) return false;
    if (this.filters.byesOnly && !fixture.isBye) return false;
    if (this.filters.opponent && fixture.opponentCode !== this.filters.opponent) return false;
    return true;
  }
}

export function fixtures(): FixtureQuery {
  return new FixtureQuery();
}
