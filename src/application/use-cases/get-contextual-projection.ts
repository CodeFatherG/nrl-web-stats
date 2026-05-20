/**
 * GetContextualProjectionUseCase — builds a context-adjusted SC projection.
 * Features: 028-player-context-analytics-opponent, 029-venue-weather-analytics
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { ProjectionRepository } from '../../domain/repositories/projection-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GetPlayerProjectionUseCase, WatermarkFn } from './get-player-projection.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type {
  ContextualEligibleGame,
  ContextualProjectionResult,
  OpponentDefensiveProfile,
  ProjectionValues,
  VenueAdjustment,
  WeatherAdjustment,
} from '../../analytics/contextual-projection-types.js';
import {
  buildOpponentDefenseProfile,
  computeOpponentMultiplier,
  computeVenueMultiplier,
  computeWeatherMultiplier,
  applyMultipliers,
} from '../../analytics/contextual-projection-service.js';
import type { WeatherCategory } from '../../config/weather-normalisation.js';
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
    private readonly projectionRepository: ProjectionRepository,
    private readonly watermarkFn: WatermarkFn,
  ) {}

  async execute(
    year: number,
    playerId: string,
    opponent?: string,
    venue?: string,
    weather?: WeatherCategory,
  ): Promise<ContextualProjectionOutcome> {
    // ── Repo-first read path (spec 034, US3) ─────────────────────────────
    // The (player, year) aggregate already contains baseProfile + the full
    // contextualProfile fan-out. On a warm hit we slice the requested
    // opponent/venue/weather in memory and return — no D1 work needed.
    try {
      const agg = await this.projectionRepository.findPlayerAggregate(year, playerId);
      if (agg !== null && agg.asOfRound >= (await this.watermarkFn(year))) {
        const baseProjection: ProjectionValues = {
          total: agg.baseProfile.projectedTotal,
          floor: agg.baseProfile.projectedFloor,
          ceiling: agg.baseProfile.projectedCeiling,
        };
        const adjustments: ContextualProjectionResult['adjustments'] = {};
        const multipliers: number[] = [];
        if (opponent) {
          const o = agg.contextualProfile.opponents[opponent];
          if (o) { adjustments.opponent = o; multipliers.push(o.multiplier); }
        }
        if (venue) {
          const v = agg.contextualProfile.venues[venue];
          if (v) { adjustments.venue = v; multipliers.push(v.multiplier); }
        }
        if (weather) {
          const w = agg.contextualProfile.weather[weather];
          if (w) { adjustments.weather = w; } // weather not applied to projection
        }
        const result: ContextualProjectionResult = {
          playerId: agg.contextualProfile.playerId,
          playerName: agg.contextualProfile.playerName,
          teamCode: agg.contextualProfile.teamCode,
          position: agg.contextualProfile.position,
          year,
          baseProjection,
          adjustedProjection: applyMultipliers(baseProjection, multipliers),
          adjustments,
        };
        return { kind: 'ok', result };
      }
    } catch (err) {
      logger.warn('contextual projection repository read failed; falling back to live', {
        playerId, year, error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Live fallback ────────────────────────────────────────────────────
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
    const perPlayerKey = `contextual-projection:${playerId}:${opponent ?? 'none'}:${venue ?? 'none'}:${weather ?? 'none'}:${year}`;
    const cachedResult = this.analyticsCache.get<ContextualProjectionResult>(perPlayerKey, cacheVersion);
    if (cachedResult) return { kind: 'ok', result: cachedResult };

    const loadedYears = await this.matchRepository.getLoadedYears();

    // Build match context map (matchId → { stadium, weather }) for all loaded seasons.
    // Used to attach venue/weather to each eligible game for RPI computation.
    const matchContext = new Map<string, { stadium: string | null; weather: string | null }>();
    for (const season of loadedYears) {
      const seasonMatches = season === year
        ? matches // reuse already-fetched current-year matches
        : await this.matchRepository.findByYear(season);
      for (const m of seasonMatches) {
        matchContext.set(m.id, { stadium: m.stadium, weather: m.weather });
      }
    }

    const playerGames = await this.buildPlayerGames(playerId, loadedYears, matchContext);

    const baseProjection: ProjectionValues = {
      total: baseProfile.projectedTotal,
      floor: baseProfile.projectedFloor,
      ceiling: baseProfile.projectedCeiling,
    };

    // Compute context adjustments — opponent and venue are applied to the projection;
    // weather is informational only.
    const adjustments: ContextualProjectionResult['adjustments'] = {};
    const multipliers: number[] = [];

    if (opponent) {
      const defenseProfile = await this.getOrBuildDefenseProfile(year, latestCompleteRound, cacheVersion);
      const opponentAdj = computeOpponentMultiplier(defenseProfile, player.position, opponent, playerGames);
      adjustments.opponent = opponentAdj;
      multipliers.push(opponentAdj.multiplier);
    }

    if (venue) {
      const venueAdj = computeVenueMultiplier(playerGames, venue);
      adjustments.venue = venueAdj;
      multipliers.push(venueAdj.multiplier);
    }

    if (weather) {
      // Weather is informational — computed but not multiplied into the projection.
      const weatherAdj = computeWeatherMultiplier(playerGames, weather);
      adjustments.weather = weatherAdj;
    }

    const adjustedProjection = applyMultipliers(baseProjection, multipliers);

    const result: ContextualProjectionResult = {
      playerId: player.id,
      playerName: player.name,
      teamCode: player.teamCode,
      position: player.position,
      year,
      baseProjection,
      adjustedProjection,
      adjustments,
    };

    this.analyticsCache.set(perPlayerKey, result, cacheVersion);
    logger.info('Computed contextual projection', { playerId, year, opponent, venue, weather });
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
          stadium: null, // not needed for defense profile aggregation
          weather: null, // not needed for defense profile aggregation
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
    matchContext: Map<string, { stadium: string | null; weather: string | null }>,
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
        const ctx = matchContext.get(match.matchId);
        games.push({
          playerId,
          round: match.round,
          totalScore: match.totalScore,
          opponent: match.opponent,
          season,
          weight,
          stadium: ctx?.stadium ?? null,
          weather: ctx?.weather ?? null,
        });
      }
    }

    return games;
  }
}
