/**
 * GetTeamStrengthRankingsUseCase — durable read path for the
 * team-strength-rankings artifact (feature 039).
 *
 * Every method consults the repository AND the watermark. When the stored
 * `asOfRound` lags the current watermark — or when the artifact is missing —
 * the method returns `null`. There is NO live-compute fallback on this path:
 * cold/stale reads surface as `{ available: false }` at the handler layer.
 */

import type {
  TeamStrengthRankingsRepository,
} from '../../domain/repositories/team-strength-rankings-repository.js';
import type {
  SeasonThresholds,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';

export interface RankedSeasonTeam {
  readonly teamCode: string;
  readonly ranking: TeamSeasonRanking;
  readonly rank: number;
}

export interface GetTeamStrengthRankingsDeps {
  readonly repository: TeamStrengthRankingsRepository;
  readonly watermarkFn: (year: number) => Promise<number>;
}

export class GetTeamStrengthRankingsUseCase {
  constructor(private readonly deps: GetTeamStrengthRankingsDeps) {}

  /** Returns the season thresholds for `year` IFF the stored artifact's
   *  `asOfRound` matches the current watermark. `null` on miss or staleness. */
  async getSeasonThresholds(year: number): Promise<SeasonThresholds | null> {
    if (!(await this.isFreshSeason(year))) return null;
    return this.deps.repository.findSeasonThresholds(year);
  }

  async getSeasonRanking(
    year: number,
    teamCode: string,
  ): Promise<TeamSeasonRanking | null> {
    if (!(await this.isFreshSeason(year))) return null;
    const season = await this.deps.repository.findSeasonRankings(year);
    if (!season) return null;
    return season.get(teamCode.toUpperCase()) ?? null;
  }

  async getRoundRanking(
    year: number,
    round: number,
    teamCode: string,
  ): Promise<TeamRoundRanking | null> {
    const coverage = await this.deps.repository.listCoveredRoundRankings(year);
    const storedAsOfRound = coverage.get(round);
    if (storedAsOfRound === undefined) return null;
    const watermark = await this.deps.watermarkFn(year);
    if (storedAsOfRound !== watermark) return null;
    const rankings = await this.deps.repository.findRoundRankings(year, round);
    if (!rankings) return null;
    return rankings.get(teamCode.toUpperCase()) ?? null;
  }

  /** Returns the season payload sorted descending by `averageStrength` with
   *  positional `rank` derived at read time. `null` on miss or staleness. */
  async getAllSeasonRankings(year: number): Promise<RankedSeasonTeam[] | null> {
    if (!(await this.isFreshSeason(year))) return null;
    const season = await this.deps.repository.findSeasonRankings(year);
    if (!season) return null;
    const sorted = Array.from(season.values()).sort(
      (a, b) => b.averageStrength - a.averageStrength,
    );
    return sorted.map((ranking, index) => ({
      teamCode: ranking.teamCode,
      ranking,
      rank: index + 1,
    }));
  }

  private async isFreshSeason(year: number): Promise<boolean> {
    const years = await this.deps.repository.listYearsWithThresholds();
    const storedAsOfRound = years.get(year);
    if (storedAsOfRound === undefined) return false;
    const watermark = await this.deps.watermarkFn(year);
    return storedAsOfRound === watermark;
  }
}
