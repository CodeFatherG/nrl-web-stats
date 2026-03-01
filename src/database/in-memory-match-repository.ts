import type { Match } from '../domain/match.js';
import type { MatchRepository } from '../domain/repositories/match-repository.js';
import { createFixture } from '../models/fixture.js';
import { VALID_TEAM_CODES } from '../models/team.js';
import { loadFixtures } from './store.js';

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches: Map<string, Match> = new Map();
  private readonly byYear: Map<number, Set<string>> = new Map();
  private readonly byRound: Map<string, Set<string>> = new Map();
  private readonly byTeam: Map<string, Set<string>> = new Map();
  private readonly loadedYears: Set<number> = new Set();

  save(match: Match): void {
    // If match already exists, remove from indexes first
    const existing = this.matches.get(match.id);
    if (existing !== undefined) {
      this.removeMatchFromIndexes(existing);
    }

    this.matches.set(match.id, match);

    // Index by year
    if (!this.byYear.has(match.year)) {
      this.byYear.set(match.year, new Set());
    }
    this.byYear.get(match.year)!.add(match.id);

    // Index by round: "{year}-{round}"
    const roundKey = `${match.year}-${match.round}`;
    if (!this.byRound.has(roundKey)) {
      this.byRound.set(roundKey, new Set());
    }
    this.byRound.get(roundKey)!.add(match.id);

    // Index by home team
    if (match.homeTeamCode !== null) {
      if (!this.byTeam.has(match.homeTeamCode)) {
        this.byTeam.set(match.homeTeamCode, new Set());
      }
      this.byTeam.get(match.homeTeamCode)!.add(match.id);
    }

    // Index by away team
    if (match.awayTeamCode !== null) {
      if (!this.byTeam.has(match.awayTeamCode)) {
        this.byTeam.set(match.awayTeamCode, new Set());
      }
      this.byTeam.get(match.awayTeamCode)!.add(match.id);
    }
  }

  findById(id: string): Match | null {
    return this.matches.get(id) ?? null;
  }

  findByYear(year: number): Match[] {
    const ids = this.byYear.get(year);
    if (ids === undefined) {
      return [];
    }
    const results: Match[] = [];
    for (const id of ids) {
      const match = this.matches.get(id);
      if (match !== undefined) {
        results.push(match);
      }
    }
    return results;
  }

  findByYearAndRound(year: number, round: number): Match[] {
    const roundKey = `${year}-${round}`;
    const ids = this.byRound.get(roundKey);
    if (ids === undefined) {
      return [];
    }
    const results: Match[] = [];
    for (const id of ids) {
      const match = this.matches.get(id);
      if (match !== undefined) {
        results.push(match);
      }
    }
    return results;
  }

  findByTeam(teamCode: string, year?: number): Match[] {
    const ids = this.byTeam.get(teamCode);
    if (ids === undefined) {
      return [];
    }
    const results: Match[] = [];
    for (const id of ids) {
      const match = this.matches.get(id);
      if (match !== undefined) {
        if (year === undefined || match.year === year) {
          results.push(match);
        }
      }
    }
    return results;
  }

  loadForYear(year: number, matches: Match[]): void {
    // Remove all existing matches for this year
    // Copy IDs to array first since removeMatchFromIndexes mutates the byYear Set
    const existingIds = this.byYear.get(year);
    if (existingIds !== undefined) {
      const idsToRemove = Array.from(existingIds);
      for (const id of idsToRemove) {
        const match = this.matches.get(id);
        if (match !== undefined) {
          this.removeMatchFromIndexes(match);
          this.matches.delete(id);
        }
      }
      this.byYear.delete(year);
    }

    // Insert all new matches
    for (const match of matches) {
      this.save(match);
    }

    // Mark year as loaded
    this.loadedYears.add(year);

    // Legacy store bridge — convert Match[] to Fixture[] for the legacy store
    const fixtures = [];
    // Track which teams play in each round to infer byes
    const teamsPlayingByRound = new Map<number, Set<string>>();

    for (const match of matches) {
      if (match.homeTeamCode !== null && match.awayTeamCode !== null) {
        const homeFixture = createFixture(
          match.year,
          match.round,
          match.homeTeamCode,
          match.awayTeamCode,
          true,
          match.homeStrengthRating ?? 0
        );
        const awayFixture = createFixture(
          match.year,
          match.round,
          match.awayTeamCode,
          match.homeTeamCode,
          false,
          match.awayStrengthRating ?? 0
        );
        fixtures.push(homeFixture, awayFixture);

        // Track teams playing this round
        if (!teamsPlayingByRound.has(match.round)) {
          teamsPlayingByRound.set(match.round, new Set());
        }
        const playing = teamsPlayingByRound.get(match.round)!;
        playing.add(match.homeTeamCode);
        playing.add(match.awayTeamCode);
      }
    }

    // Infer bye fixtures: teams not playing in a round have a bye
    for (const [round, playingTeams] of teamsPlayingByRound) {
      for (const teamCode of VALID_TEAM_CODES) {
        if (!playingTeams.has(teamCode)) {
          fixtures.push(createFixture(year, round, teamCode, null, false, 0));
        }
      }
    }

    loadFixtures(year, fixtures);
  }

  getLoadedYears(): number[] {
    return Array.from(this.loadedYears).sort((a, b) => a - b);
  }

  isYearLoaded(year: number): boolean {
    return this.loadedYears.has(year);
  }

  getMatchCount(): number {
    return this.matches.size;
  }

  private removeMatchFromIndexes(match: Match): void {
    // Remove from byRound index
    const roundKey = `${match.year}-${match.round}`;
    const roundSet = this.byRound.get(roundKey);
    if (roundSet !== undefined) {
      roundSet.delete(match.id);
      if (roundSet.size === 0) {
        this.byRound.delete(roundKey);
      }
    }

    // Remove from byTeam index for home team
    if (match.homeTeamCode !== null) {
      const homeSet = this.byTeam.get(match.homeTeamCode);
      if (homeSet !== undefined) {
        homeSet.delete(match.id);
        if (homeSet.size === 0) {
          this.byTeam.delete(match.homeTeamCode);
        }
      }
    }

    // Remove from byTeam index for away team
    if (match.awayTeamCode !== null) {
      const awaySet = this.byTeam.get(match.awayTeamCode);
      if (awaySet !== undefined) {
        awaySet.delete(match.id);
        if (awaySet.size === 0) {
          this.byTeam.delete(match.awayTeamCode);
        }
      }
    }

    // Remove from byYear index
    const yearSet = this.byYear.get(match.year);
    if (yearSet !== undefined) {
      yearSet.delete(match.id);
      if (yearSet.size === 0) {
        this.byYear.delete(match.year);
      }
    }
  }
}
