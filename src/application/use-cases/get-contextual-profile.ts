/**
 * GetContextualProfileUseCase — returns multipliers for a player across every
 * opponent, venue, and weather category in a single response.
 *
 * Builds player games and the defensive profile once, then fans out across all
 * known teams / venues / weather categories. Weather multipliers are informational
 * only — they are not applied to any projection value.
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GetPlayerProjectionUseCase } from './get-player-projection.js';
import type { AnalyticsCache } from '../../analytics/analytics-cache.js';
import type {
  ContextualEligibleGame,
  ContextualProfileResult,
  OpponentDefensiveProfile,
  ProjectionValues,
} from '../../analytics/contextual-projection-types.js';
import {
  buildOpponentDefenseProfile,
  computeOpponentMultiplier,
  computeVenueMultiplier,
  computeWeatherMultiplier,
} from '../../analytics/contextual-projection-service.js';
import { VALID_TEAM_CODES } from '../../models/team.js';
import { VALID_VENUE_IDS } from '../../config/venue-normalisation.js';
import { VALID_WEATHER_CATEGORIES } from '../../config/weather-normalisation.js';
import { MatchStatus } from '../../domain/match.js';
import { logger } from '../../utils/logger.js';

export type ContextualProfileOutcome =
  | { kind: 'ok'; result: ContextualProfileResult }
  | { kind: 'player_not_found' }
  | { kind: 'no_projection' };

function parseMatchIdTeams(matchId: string): [string, string] | null {
  const m = matchId.match(/^\d{4}-R\d+-([A-Z]+)-([A-Z]+)$/);
  return m ? [m[1]!, m[2]!] : null;
}

export class GetContextualProfileUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supercoachUseCase: GetSupercoachScoresUseCase,
    private readonly projectionUseCase: GetPlayerProjectionUseCase,
    private readonly matchRepository: MatchRepository,
    private readonly analyticsCache: AnalyticsCache,
  ) {}

  async execute(year: number, playerId: string): Promise<ContextualProfileOutcome> {
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
    const cacheKey = `contextual-profile:${playerId}:${year}`;
    const cached = this.analyticsCache.get<ContextualProfileResult>(cacheKey, cacheVersion);
    if (cached) return { kind: 'ok', result: cached };

    const loadedYears = await this.matchRepository.getLoadedYears();

    const matchContext = new Map<string, { stadium: string | null; weather: string | null }>();
    for (const season of loadedYears) {
      const seasonMatches = season === year
        ? matches
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

    const defenseProfile = await this.getOrBuildDefenseProfile(year, latestCompleteRound, cacheVersion, loadedYears);

    const opponents: ContextualProfileResult['opponents'] = {};
    for (const teamCode of VALID_TEAM_CODES) {
      if (teamCode === player.teamCode) continue; // skip own team
      opponents[teamCode] = computeOpponentMultiplier(defenseProfile, player.position, teamCode, playerGames);
    }

    const venues: ContextualProfileResult['venues'] = {};
    for (const venueId of VALID_VENUE_IDS) {
      venues[venueId] = computeVenueMultiplier(playerGames, venueId);
    }

    const weather: ContextualProfileResult['weather'] = {};
    for (const category of VALID_WEATHER_CATEGORIES) {
      weather[category] = computeWeatherMultiplier(playerGames, category);
    }

    const result: ContextualProfileResult = {
      playerId: player.id,
      playerName: player.name,
      teamCode: player.teamCode,
      position: player.position,
      year,
      baseProjection,
      opponents,
      venues,
      weather,
    };

    this.analyticsCache.set(cacheKey, result, cacheVersion);
    logger.info('Computed contextual profile', { playerId, year });
    return { kind: 'ok', result };
  }

  private async getOrBuildDefenseProfile(
    year: number,
    latestCompleteRound: number,
    cacheVersion: string,
    loadedYears: number[],
  ): Promise<OpponentDefensiveProfile> {
    const defenseKey = `opponent-defense-profile:${year}`;
    const cached = this.analyticsCache.get<OpponentDefensiveProfile>(defenseKey, cacheVersion);
    if (cached) return cached;

    const minSeason = loadedYears.length > 0 ? Math.min(...loadedYears) : year;
    const maxSeason = loadedYears.length > 0 ? Math.max(...loadedYears) : year;

    const positions = new Map<string, string>();
    for (const season of loadedYears) {
      const summaries = await this.playerRepository.findAllSeasonSummaries(season);
      for (const s of summaries) {
        if (!positions.has(s.playerId)) positions.set(s.playerId, s.position);
      }
    }

    const allGames: ContextualEligibleGame[] = [];
    for (const season of loadedYears) {
      const perfs = await this.playerRepository.findAllSeasonPerformancesSummary(season);
      const weight = 1 + (season - minSeason) / Math.max(maxSeason - minSeason, 1);
      for (const perf of perfs) {
        const teams = parseMatchIdTeams(perf.matchId);
        if (!teams) continue;
        const [t1, t2] = teams;
        const opponent = t1 === perf.teamCode ? t2 : t2 === perf.teamCode ? t1 : null;
        if (!opponent) continue;
        allGames.push({
          playerId: perf.playerId,
          round: 0,
          totalScore: perf.fantasyPointsTotal,
          opponent,
          season,
          weight,
          stadium: null,
          weather: null,
        });
      }
    }

    const profile = buildOpponentDefenseProfile(allGames, positions, year, latestCompleteRound);
    this.analyticsCache.set(defenseKey, profile, cacheVersion);
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
