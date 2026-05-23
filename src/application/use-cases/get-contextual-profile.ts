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
import type { ProjectionRepository } from '../../domain/repositories/projection-repository.js';
import type { GetSupercoachScoresUseCase } from './get-supercoach-scores.js';
import type { GetPlayerProjectionUseCase, WatermarkFn } from './get-player-projection.js';
import type {
  ContextualEligibleGame,
  ContextualProfileResult,
  OpponentDefensiveProfile,
  ProjectionValues,
} from '../../analytics/contextual-projection-types.js';
import type { PlayerProjectionProfile } from '../../analytics/player-projection-types.js';
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
    private readonly projectionRepository: ProjectionRepository,
    private readonly watermarkFn: WatermarkFn,
  ) {}

  async execute(year: number, playerId: string): Promise<ContextualProfileOutcome> {
    // ── Repo-first read path (spec 034, US3) ─────────────────────────────
    try {
      const agg = await this.projectionRepository.findPlayerAggregate(year, playerId);
      if (agg !== null && agg.asOfRound >= (await this.watermarkFn(year))) {
        return { kind: 'ok', result: agg.contextualProfile };
      }
    } catch (err) {
      logger.warn('contextual profile repository read failed; falling back to live', {
        playerId, year, error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Live fallback ────────────────────────────────────────────────────
    const outcome = await this.computeLive(year, playerId);

    // ── SPEC-034-READTHROUGH START ───────────────────────────────────────
    // Opportunistic cache population: on miss/stale, write the freshly-
    // computed PlayerProjectionAggregate so subsequent reads of any of the
    // four projection endpoints serve warm. Off the response critical path
    // is a `ctx.waitUntil` away — for now we await synchronously, accepting
    // the extra ~50ms on a fall-through (which already took seconds).
    //
    // To remove: delete this entire block. The cron-fired precompute path
    // still populates the cache as before. Safe to revert at any time.
    // (Also remove the matching block in get-team-projection-rankings.ts.)
    if (outcome.kind === 'ok') {
      await this.tryPopulateAggregate(year, playerId, outcome.result);
    }
    // ── SPEC-034-READTHROUGH END ─────────────────────────────────────────

    return outcome;
  }

  /** SPEC-034-READTHROUGH — write the full PlayerProjectionAggregate after a
   *  live fallback. Errors are caught and logged; they never propagate to the
   *  user (read path must never fail on cache concerns — SC-008). */
  private async tryPopulateAggregate(
    year: number,
    playerId: string,
    contextualProfile: ContextualProfileResult,
  ): Promise<void> {
    try {
      // baseProfile is needed to assemble the full aggregate. projectionUseCase
      // is repo-first; on miss it will live-compute (and write-through to the
      // projection store via its own read-through block). Spec 037 removes the
      // intermediate AnalyticsCache layer that used to coalesce these calls.
      const baseProfile = await this.projectionUseCase.execute(year, playerId);
      if (!baseProfile) return;
      const asOfRound = await this.watermarkFn(year);
      await this.projectionRepository.savePlayerAggregate({
        playerId,
        year,
        asOfRound,
        computedAt: new Date().toISOString(),
        baseProfile,
        contextualProfile,
      });
    } catch (err) {
      logger.warn('read-through write failed (contextual profile)', {
        playerId, year, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Pure live computation — exposed for the precompute use cases so they can
   *  build aggregates without recursing through the repo-first path.
   *
   *  `opts.baseProfile`: when provided, skips the internal projectionUseCase
   *  call. The precompute path passes the baseProfile it just computed so each
   *  player's projection work happens once, not twice. */
  async computeLive(
    year: number,
    playerId: string,
    opts?: { baseProfile?: PlayerProjectionProfile | null },
  ): Promise<ContextualProfileOutcome> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) return { kind: 'player_not_found' };

    const baseProfile = opts?.baseProfile ?? await this.projectionUseCase.execute(year, playerId);
    if (!baseProfile) return { kind: 'no_projection' };

    const matches = await this.matchRepository.findByYear(year);
    const completedRounds = matches
      .filter(m => m.status === MatchStatus.Completed)
      .map(m => m.round);
    const latestCompleteRound = completedRounds.length > 0 ? Math.max(...completedRounds) : 0;

    // Spec 037 — RAM memoization (AnalyticsCache) removed. Live compute every
    // time we reach this path; the projection store's read-through block
    // provides cross-isolate durable caching for the assembled aggregate.

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

    const defenseProfile = await this.buildDefenseProfile(year, latestCompleteRound, loadedYears);

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

    logger.info('Computed contextual profile', { playerId, year });
    return { kind: 'ok', result };
  }

  private async buildDefenseProfile(
    year: number,
    latestCompleteRound: number,
    loadedYears: number[],
  ): Promise<OpponentDefensiveProfile> {
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
