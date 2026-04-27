/**
 * GetContextualProjectionUseCase — builds an opponent-adjusted SC projection.
 * Feature: 028-player-context-analytics-opponent
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GetPlayerProjectionUseCase } from './get-player-projection.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type {
  ContextualEligibleGame,
  ContextualProjectionResult,
  OpponentDefensiveProfile,
  ProjectionValues,
} from '../../analytics/contextual-projection-types.js';
import {
  buildOpponentDefenseProfile,
  computeOpponentMultiplier,
  applyOpponentAdjustment,
} from '../../analytics/contextual-projection-service.js';
import { MatchStatus } from '../../domain/match.js';
import { logger } from '../../utils/logger.js';

export type ContextualProjectionOutcome =
  | { kind: 'ok'; result: ContextualProjectionResult }
  | { kind: 'player_not_found' }
  | { kind: 'no_projection' };

/**
 * Parse two team codes from a domain matchId (e.g. "2025-R1-CBR-NZL").
 * Returns null for numeric fallback IDs (unmapped teams).
 */
function parseMatchIdTeams(matchId: string): [string, string] | null {
  const m = matchId.match(/^\d{4}-R\d+-([A-Z]+)-([A-Z]+)$/);
  return m ? [m[1]!, m[2]!] : null;
}

export class GetContextualProjectionUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supercoachUseCase: GetSupercoachScoresUseCase,
    private readonly projectionUseCase: GetPlayerProjectionUseCase,
    private readonly matchRepository: MatchRepository,
    private readonly analyticsCache: AnalyticsCache,
  ) {}

  async execute(year: number, playerId: string, opponent: string): Promise<ContextualProjectionOutcome> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) return { kind: 'player_not_found' };

    const baseProfile = await this.projectionUseCase.execute(year, playerId);
    if (!baseProfile) return { kind: 'no_projection' };

    const matches = await this.matchRepository.findByYear(year);
    const completedRounds = matches
      .filter(m => m.status === MatchStatus.Completed)
      .map(m => m.round);
    const latestCompleteRound = completedRounds.length > 0 ? Math.max(...completedRounds) : 0;

    const cacheVersion = `${year}:${latestCompleteRound}`;

    const perPlayerKey = `contextual-projection:${playerId}:${opponent}:${year}`;
    const cachedResult = this.analyticsCache.get<ContextualProjectionResult>(perPlayerKey, cacheVersion);
    if (cachedResult) return { kind: 'ok', result: cachedResult };

    const defenseProfile = await this.getOrBuildDefenseProfile(year, latestCompleteRound, cacheVersion);

    const loadedYears = await this.matchRepository.getLoadedYears();
    const playerGames = await this.buildPlayerGames(playerId, loadedYears);

    const baseProjection: ProjectionValues = {
      total: baseProfile.projectedTotal,
      floor: baseProfile.projectedFloor,
      ceiling: baseProfile.projectedCeiling,
    };

    const opponentAdj = computeOpponentMultiplier(defenseProfile, player.position, opponent, playerGames);
    const adjustedProjection = applyOpponentAdjustment(baseProjection, opponentAdj);

    const result: ContextualProjectionResult = {
      playerId: player.id,
      playerName: player.name,
      teamCode: player.teamCode,
      position: player.position,
      year,
      baseProjection,
      adjustedProjection,
      adjustments: { opponent: opponentAdj },
    };

    this.analyticsCache.set(perPlayerKey, result, cacheVersion);
    logger.info('Computed contextual projection', { playerId, year, opponent });
    return { kind: 'ok', result };
  }

  private async getOrBuildDefenseProfile(
    year: number,
    latestCompleteRound: number,
    cacheVersion: string,
  ): Promise<OpponentDefensiveProfile> {
    const defenseKey = `opponent-defense-profile:${year}`;
    const cached = this.analyticsCache.get<OpponentDefensiveProfile>(defenseKey, cacheVersion);
    if (cached) return cached;

    const loadedYears = await this.matchRepository.getLoadedYears();
    const minSeason = loadedYears.length > 0 ? Math.min(...loadedYears) : year;
    const maxSeason = loadedYears.length > 0 ? Math.max(...loadedYears) : year;

    // Build position map: one query per season (O(seasons) not O(players))
    const positions = new Map<string, string>();
    for (const season of loadedYears) {
      const summaries = await this.playerRepository.findAllSeasonSummaries(season);
      for (const s of summaries) {
        if (!positions.has(s.playerId)) positions.set(s.playerId, s.position);
      }
    }

    // Bulk-fetch all completed performances per season — one D1 query per season.
    // Uses fantasyPointsTotal (stored from nrl.com) as the SC score approximation.
    // The defense factor is a ratio (teamMean / leagueMean), so consistent
    // under-counting cancels out and factors remain accurate.
    const allGames: ContextualEligibleGame[] = [];
    for (const season of loadedYears) {
      const perfs = await this.playerRepository.findAllSeasonPerformancesSummary(season);
      const weight = 1 + (season - minSeason) / Math.max(maxSeason - minSeason, 1);
      for (const perf of perfs) {
        const teams = parseMatchIdTeams(perf.matchId);
        if (!teams) continue; // skip numeric fallback IDs
        const [t1, t2] = teams;
        const opponent = t1 === perf.teamCode ? t2 : t2 === perf.teamCode ? t1 : null;
        if (!opponent) continue;
        allGames.push({
          playerId: perf.playerId,
          round: 0, // not needed for defense profile aggregation
          totalScore: perf.fantasyPointsTotal,
          opponent,
          season,
          weight,
        });
      }
    }

    const profile = buildOpponentDefenseProfile(allGames, positions, year, latestCompleteRound);
    this.analyticsCache.set(defenseKey, profile, cacheVersion);
    logger.info('Built opponent defense profile', {
      year,
      latestCompleteRound,
      playerCount: positions.size,
      gameCount: allGames.length,
    });
    return profile;
  }

  private async buildPlayerGames(
    playerId: string,
    loadedYears: number[],
  ): Promise<ContextualEligibleGame[]> {
    const minSeason = loadedYears.length > 0 ? Math.min(...loadedYears) : 0;
    const maxSeason = loadedYears.length > 0 ? Math.max(...loadedYears) : 0;
    const games: ContextualEligibleGame[] = [];

    for (const season of loadedYears) {
      const scSeason = await this.supercoachUseCase.executeForPlayer(season, playerId);
      if (!scSeason) continue;
      const weight = 1 + (season - minSeason) / Math.max(maxSeason - minSeason, 1);
      for (const match of scSeason.matches) {
        if (!match.isComplete) continue;
        games.push({
          playerId,
          round: match.round,
          totalScore: match.totalScore,
          opponent: match.opponent,
          season,
          weight,
        });
      }
    }

    return games;
  }
}
