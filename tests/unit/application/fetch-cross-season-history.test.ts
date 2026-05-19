import { describe, it, expect, vi } from 'vitest';
import { fetchCrossSeasonHistory } from '../../../src/application/use-cases/get-game-strength.js';
import type { GetSupercoachScoresUseCase } from '../../../src/application/use-cases/get-supercoach-scores.js';
import type { TeamSeasonSupercoach, MatchSupercoachResult, TeamSupercoachGroup } from '../../../src/domain/supercoach-score.js';

function makeGroup(code: string, total: number): TeamSupercoachGroup {
  return { teamCode: code, teamName: code, teamTotal: total, isComplete: true, players: [] };
}

function makeMatch(year: number, round: number, home: string, away: string, hTotal: number, aTotal: number): MatchSupercoachResult {
  return {
    matchId: `${year}-R${round}-${home}-${away}`,
    year, round, isComplete: true,
    homeTeam: makeGroup(home, hTotal),
    awayTeam: makeGroup(away, aTotal),
  };
}

function makeSeason(year: number, teamCode: string, matches: MatchSupercoachResult[]): TeamSeasonSupercoach {
  return { year, teamCode, teamName: teamCode, matches };
}

describe('fetchCrossSeasonHistory', () => {
  it('merges previous and current year matches in chronological order', async () => {
    const sc = {
      executeForTeamSeason: vi.fn(async (year: number, code: string) => {
        if (year === 2025) return makeSeason(2025, code, [
          makeMatch(2025, 24, 'BRO', 'X', 1500, 1200),
          makeMatch(2025, 25, 'Y', 'BRO', 1100, 1700),
        ]);
        if (year === 2026) return makeSeason(2026, code, [
          makeMatch(2026, 1, 'BRO', 'Z', 1800, 1600),
        ]);
        throw new Error('no data');
      }),
    } as unknown as GetSupercoachScoresUseCase;

    const result = await fetchCrossSeasonHistory(sc, 2026, 'BRO');
    expect(result.matches).toHaveLength(3);
    // Sorted ascending by (year, round): 2025/R24, 2025/R25, 2026/R1
    expect(result.matches.map(m => `${m.year}-R${m.round}`)).toEqual([
      '2025-R24', '2025-R25', '2026-R1',
    ]);
  });

  it('returns current year only when previous year throws', async () => {
    const sc = {
      executeForTeamSeason: vi.fn(async (year: number, code: string) => {
        if (year === 2025) throw new Error('no 2025 data');
        if (year === 2026) return makeSeason(2026, code, [
          makeMatch(2026, 1, 'BRO', 'Z', 1800, 1600),
        ]);
        throw new Error('no data');
      }),
    } as unknown as GetSupercoachScoresUseCase;

    const result = await fetchCrossSeasonHistory(sc, 2026, 'BRO');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].year).toBe(2026);
  });

  it('for Round 1 of new season, history comes entirely from previous year', async () => {
    const sc = {
      executeForTeamSeason: vi.fn(async (year: number, code: string) => {
        if (year === 2025) return makeSeason(2025, code, [
          makeMatch(2025, 23, 'BRO', 'X', 1500, 1200),
          makeMatch(2025, 24, 'Y', 'BRO', 1100, 1700),
          makeMatch(2025, 25, 'BRO', 'Z', 1900, 1300),
        ]);
        if (year === 2026) return makeSeason(2026, code, []); // no 2026 matches yet
        throw new Error('no data');
      }),
    } as unknown as GetSupercoachScoresUseCase;

    const result = await fetchCrossSeasonHistory(sc, 2026, 'BRO');
    expect(result.matches).toHaveLength(3);
    expect(result.matches.every(m => m.year === 2025)).toBe(true);
  });
});
