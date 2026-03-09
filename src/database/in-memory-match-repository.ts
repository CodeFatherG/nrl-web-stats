import type { Match } from '../domain/match.js';
import type { MatchRepository } from '../domain/repositories/match-repository.js';
import { buildLegacyFixtureBridge } from './legacy-fixture-bridge.js';

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches: Map<string, Match> = new Map();
  private readonly byYear: Map<number, Set<string>> = new Map();
  private readonly byRound: Map<string, Set<string>> = new Map();
  private readonly byTeam: Map<string, Set<string>> = new Map();
  private readonly loadedYears: Set<number> = new Set();

  async save(match: Match): Promise<void> {
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

  async saveAll(matches: Match[]): Promise<void> {
    for (const match of matches) {
      await this.save(match);
    }

    // Determine year from matches for loaded tracking and legacy bridge
    if (matches.length > 0) {
      const year = matches[0].year;
      this.loadedYears.add(year);
      this.buildLegacyFixtureBridgeFromMatches(year, matches);
    }
  }

  async findById(id: string): Promise<Match | null> {
    return this.matches.get(id) ?? null;
  }

  async findByYear(year: number): Promise<Match[]> {
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

  async findByYearAndRound(year: number, round: number): Promise<Match[]> {
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

  async findByTeam(teamCode: string, year?: number): Promise<Match[]> {
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

  async getLoadedYears(): Promise<number[]> {
    return Array.from(this.loadedYears).sort((a, b) => a - b);
  }

  async isYearLoaded(year: number): Promise<boolean> {
    return this.loadedYears.has(year);
  }

  async getMatchCount(): Promise<number> {
    return this.matches.size;
  }

  private buildLegacyFixtureBridgeFromMatches(year: number, matches: Match[]): void {
    buildLegacyFixtureBridge(year, matches);
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
