/**
 * GetSupercoachScoresUseCase — orchestrates computing Supercoach scores for a round.
 *
 * Fetches primary stats from PlayerRepository, supplementary stats from D1,
 * runs name matching to join them, computes scores via the scoring service.
 * Auto-persists new player name links when algorithmic matching succeeds.
 */

import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { Match } from '../../domain/match.js';
import type { D1SupplementaryStatsRepository } from '../../infrastructure/persistence/d1-supplementary-stats-repo.js';
import type { ScoringConfig } from '../../config/supercoach-scoring-config.js';
import type { SupplementaryPlayerStats } from '../../domain/ports/supplementary-stats-source.js';
import type { SupercoachScore, PlayerSeasonSupercoach, MatchSupercoachResult, TeamSupercoachGroup, RoundSupercoachResult, TeamSeasonSupercoach, PlayerMatchSupercoach } from '../../domain/supercoach-score.js';
import type { MergedPlayerStats } from '../../analytics/supercoach-types.js';
import type { D1PlayerNameLinkRepository, PlayerNameLink } from '../../infrastructure/persistence/d1-player-name-link-repo.js';
import type { MatchingContext } from '../../config/player-name-matcher.js';
import { extractPrimaryScoringStats } from '../../analytics/supercoach-types.js';
import { computePlayerScore } from '../../analytics/supercoach-scoring-service.js';
import { matchPlayerName } from '../../config/player-name-matcher.js';
import { getTeam } from '../../models/team.js';
import { logger } from '../../utils/logger.js';

export class GetSupercoachScoresUseCase {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly supplementaryRepo: D1SupplementaryStatsRepository,
    private readonly scoringConfig: ScoringConfig,
    private readonly linkRepo?: D1PlayerNameLinkRepository,
    private readonly matchRepository?: MatchRepository
  ) {}

  /** Build matching context from persisted links and supplementary team codes */
  private async buildMatchingContext(
    supplementaryStats: SupplementaryPlayerStats[]
  ): Promise<MatchingContext> {
    // Load persisted links
    const persistedLinks = new Map<string, string>();
    if (this.linkRepo) {
      const allLinks = await this.linkRepo.findAll();
      for (const link of allLinks) {
        persistedLinks.set(link.playerId, link.supplementaryName);
      }
    }

    // Build supplementary team code map
    const supplementaryTeamCodes = new Map<string, string>();
    for (const stat of supplementaryStats) {
      if (stat.teamCode) {
        supplementaryTeamCodes.set(stat.playerName, stat.teamCode);
      }
    }

    return { persistedLinks, supplementaryTeamCodes };
  }

  /** Auto-persist a newly discovered link (non-blocking) */
  private persistLink(
    playerId: string,
    playerName: string,
    teamCode: string,
    supplementaryName: string,
    confidence: string,
    linksToSave: PlayerNameLink[]
  ): void {
    linksToSave.push({
      playerId,
      playerName,
      teamCode,
      supplementaryName,
      confidence,
      source: 'auto',
    });
  }

  // ============================================================
  // Match-grouped computation helpers
  // ============================================================

  /**
   * Score all players in one team for a given match.
   * Supplementary stats must be pre-loaded by the caller (avoids redundant round-level fetches).
   */
  private async computeTeamGroup(
    match: Match,
    teamCode: string,
    supplementaryStats: SupplementaryPlayerStats[],
    supplementaryMap: Map<string, SupplementaryPlayerStats>,
    supplementaryNames: string[],
    matchingContext: MatchingContext,
    linksToSave: PlayerNameLink[]
  ): Promise<TeamSupercoachGroup> {
    const team = getTeam(teamCode);
    const performances = await this.playerRepository.findPerformancesByMatch(match.year, match.round, teamCode);
    const players: SupercoachScore[] = [];

    for (const { playerName, playerId, performance } of performances) {
      const nameParts = playerName.split(' ');
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const identityMatch = supplementaryStats.length > 0
        ? matchPlayerName(playerId, firstName, lastName, teamCode, supplementaryNames, matchingContext)
        : null;

      let supplementary: SupplementaryPlayerStats | null = null;
      let matchConfidence: MergedPlayerStats['matchConfidence'] = 'unmatched';

      if (identityMatch) {
        supplementary = supplementaryMap.get(identityMatch.supplementaryName) ?? null;
        matchConfidence = identityMatch.confidence;
        if (identityMatch.confidence !== 'linked' && this.linkRepo) {
          this.persistLink(playerId, playerName, teamCode, identityMatch.supplementaryName, identityMatch.confidence, linksToSave);
        }
      }

      const primaryStats = extractPrimaryScoringStats({
        playerId,
        playerName,
        teamCode,
        matchId: performance.matchId,
        year: performance.year,
        round: performance.round,
        tries: performance.tries,
        conversions: performance.conversions,
        penaltyGoals: performance.penaltyGoals,
        onePointFieldGoals: performance.onePointFieldGoals,
        twoPointFieldGoals: performance.twoPointFieldGoals,
        tryAssists: performance.tryAssists,
        lineBreakAssists: performance.lineBreakAssists,
        forcedDropOutKicks: performance.forcedDropOutKicks,
        fortyTwentyKicks: performance.fortyTwentyKicks,
        twentyFortyKicks: performance.twentyFortyKicks,
        kicksDead: performance.kicksDead,
        tackleBreaks: performance.tackleBreaks,
        lineBreaks: performance.lineBreaks,
        intercepts: performance.intercepts,
        tacklesMade: performance.tacklesMade,
        missedTackles: performance.missedTackles,
        penalties: performance.penalties,
        errors: performance.errors,
        sinBins: performance.sinBins,
        sendOffs: performance.sendOffs,
        offloads: performance.offloads,
        allRuns: performance.allRuns,
      });

      players.push(computePlayerScore({ primary: primaryStats, supplementary, matchConfidence }, this.scoringConfig));
    }

    players.sort((a, b) => b.totalScore - a.totalScore);
    const teamTotal = players.reduce((sum, p) => sum + p.totalScore, 0);
    // Complete if supplementary data was available for the round (individual unmatched players are expected for fringe bench players)
    const isComplete = supplementaryStats.length > 0;

    return {
      teamCode,
      teamName: team?.name ?? teamCode,
      teamTotal,
      isComplete,
      players,
    };
  }

  /**
   * Compute a full MatchSupercoachResult for both teams.
   * Supplementary stats are loaded once per round and passed in by the caller.
   */
  private async computeMatchResult(
    match: Match,
    supplementaryStats: SupplementaryPlayerStats[],
    supplementaryMap: Map<string, SupplementaryPlayerStats>,
    supplementaryNames: string[],
    matchingContext: MatchingContext,
    linksToSave: PlayerNameLink[]
  ): Promise<MatchSupercoachResult> {
    const homeTeamCode = match.homeTeamCode ?? '';
    const awayTeamCode = match.awayTeamCode ?? '';

    const [homeTeam, awayTeam] = await Promise.all([
      homeTeamCode
        ? this.computeTeamGroup(match, homeTeamCode, supplementaryStats, supplementaryMap, supplementaryNames, matchingContext, linksToSave)
        : Promise.resolve({ teamCode: '', teamName: 'Unknown', teamTotal: 0, isComplete: false, players: [] }),
      awayTeamCode
        ? this.computeTeamGroup(match, awayTeamCode, supplementaryStats, supplementaryMap, supplementaryNames, matchingContext, linksToSave)
        : Promise.resolve({ teamCode: '', teamName: 'Unknown', teamTotal: 0, isComplete: false, players: [] }),
    ]);

    return {
      matchId: match.id,
      year: match.year,
      round: match.round,
      isComplete: homeTeam.isComplete && awayTeam.isComplete,
      homeTeam,
      awayTeam,
    };
  }

  /**
   * Compute Supercoach scores for a single match by matchId.
   */
  async executeForMatch(matchId: string): Promise<MatchSupercoachResult | null> {
    if (!this.matchRepository) {
      logger.error('executeForMatch called without matchRepository');
      return null;
    }

    const match = await this.matchRepository.findById(matchId);
    if (!match) return null;

    const supplementaryStats = await this.supplementaryRepo.findByRound(match.year, match.round);
    const supplementaryNames = supplementaryStats.map(s => s.playerName);
    const supplementaryMap = new Map<string, SupplementaryPlayerStats>(supplementaryStats.map(s => [s.playerName, s]));
    const matchingContext = await this.buildMatchingContext(supplementaryStats);
    const linksToSave: PlayerNameLink[] = [];

    const result = await this.computeMatchResult(match, supplementaryStats, supplementaryMap, supplementaryNames, matchingContext, linksToSave);

    if (linksToSave.length > 0 && this.linkRepo) {
      this.linkRepo.saveBatch(linksToSave).catch(err =>
        logger.error('Failed to persist player name links', { error: err instanceof Error ? err.message : String(err) })
      );
    }

    return result;
  }

  /**
   * Compute Supercoach scores for all matches in a round.
   */
  async executeForRound(year: number, round: number): Promise<RoundSupercoachResult> {
    if (!this.matchRepository) {
      logger.error('executeForRound called without matchRepository');
      return { year, round, isComplete: false, matchCount: 0, matches: [] };
    }

    const matches = await this.matchRepository.findByYearAndRound(year, round);

    if (matches.length === 0) {
      return { year, round, isComplete: false, matchCount: 0, matches: [] };
    }

    // Load supplementary stats once for the whole round
    const supplementaryStats = await this.supplementaryRepo.findByRound(year, round);
    const supplementaryNames = supplementaryStats.map(s => s.playerName);
    const supplementaryMap = new Map<string, SupplementaryPlayerStats>(supplementaryStats.map(s => [s.playerName, s]));
    const matchingContext = await this.buildMatchingContext(supplementaryStats);
    const linksToSave: PlayerNameLink[] = [];

    const matchResults: MatchSupercoachResult[] = [];
    for (const match of matches) {
      matchResults.push(await this.computeMatchResult(match, supplementaryStats, supplementaryMap, supplementaryNames, matchingContext, linksToSave));
    }

    if (linksToSave.length > 0 && this.linkRepo) {
      this.linkRepo.saveBatch(linksToSave).catch(err =>
        logger.error('Failed to persist player name links', { error: err instanceof Error ? err.message : String(err) })
      );
    }

    const isComplete = matchResults.length > 0 && matchResults.every(m => m.isComplete);

    return {
      year,
      round,
      isComplete,
      matchCount: matchResults.length,
      matches: matchResults,
    };
  }

  /**
   * Compute Supercoach scores for all matches a team played in a year.
   */
  async executeForTeamSeason(year: number, teamCode: string): Promise<TeamSeasonSupercoach> {
    const team = getTeam(teamCode);

    if (!this.matchRepository) {
      logger.error('executeForTeamSeason called without matchRepository');
      return { year, teamCode, teamName: team?.name ?? teamCode, matches: [] };
    }

    const matches = await this.matchRepository.findByTeam(teamCode, year);
    matches.sort((a, b) => a.round - b.round);

    const linksToSave: PlayerNameLink[] = [];
    const matchResults: MatchSupercoachResult[] = [];

    for (const match of matches) {
      const supplementaryStats = await this.supplementaryRepo.findByRound(match.year, match.round);
      const supplementaryNames = supplementaryStats.map(s => s.playerName);
      const supplementaryMap = new Map<string, SupplementaryPlayerStats>(supplementaryStats.map(s => [s.playerName, s]));
      const matchingContext = await this.buildMatchingContext(supplementaryStats);
      matchResults.push(await this.computeMatchResult(match, supplementaryStats, supplementaryMap, supplementaryNames, matchingContext, linksToSave));
    }

    if (linksToSave.length > 0 && this.linkRepo) {
      this.linkRepo.saveBatch(linksToSave).catch(err =>
        logger.error('Failed to persist player name links', { error: err instanceof Error ? err.message : String(err) })
      );
    }

    return {
      year,
      teamCode,
      teamName: team?.name ?? teamCode,
      matches: matchResults,
    };
  }

  /**
   * Compute Supercoach scores for a single player across all rounds in a season.
   */
  async executeForPlayer(year: number, playerId: string): Promise<PlayerSeasonSupercoach | null> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) return null;

    const performances = await this.playerRepository.findMatchPerformances(playerId, year);
    if (performances.length === 0) return null;

    // Load persisted links once for the whole request
    const persistedLinks = new Map<string, string>();
    if (this.linkRepo) {
      const allLinks = await this.linkRepo.findAll();
      for (const link of allLinks) {
        persistedLinks.set(link.playerId, link.supplementaryName);
      }
    }

    const matchEntries: PlayerMatchSupercoach[] = [];
    const linksToSave: PlayerNameLink[] = [];

    for (const perf of performances) {
      // Get supplementary stats for this round
      const supplementaryStats = await this.supplementaryRepo.findByRound(year, perf.round);
      const supplementaryNames = supplementaryStats.map(s => s.playerName);
      const supplementaryMap = new Map<string, SupplementaryPlayerStats>(supplementaryStats.map(s => [s.playerName, s]));

      // Build team codes for this round
      const supplementaryTeamCodes = new Map<string, string>();
      for (const stat of supplementaryStats) {
        if (stat.teamCode) supplementaryTeamCodes.set(stat.playerName, stat.teamCode);
      }

      const nameParts = player.name.split(' ');
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const identityMatch = supplementaryStats.length > 0
        ? matchPlayerName(playerId, firstName, lastName, perf.teamCode, supplementaryNames, { persistedLinks, supplementaryTeamCodes })
        : null;

      let supplementary: SupplementaryPlayerStats | null = null;
      let matchConfidence: MergedPlayerStats['matchConfidence'] = 'unmatched';

      if (identityMatch) {
        supplementary = supplementaryMap.get(identityMatch.supplementaryName) ?? null;
        matchConfidence = identityMatch.confidence;
        if (identityMatch.confidence !== 'linked' && this.linkRepo) {
          this.persistLink(playerId, player.name, perf.teamCode, identityMatch.supplementaryName, identityMatch.confidence, linksToSave);
        }
      }

      const primaryStats = extractPrimaryScoringStats({
        playerId: player.id,
        playerName: player.name,
        teamCode: perf.teamCode,
        matchId: perf.matchId,
        year: perf.year,
        round: perf.round,
        tries: perf.tries,
        conversions: perf.conversions,
        penaltyGoals: perf.penaltyGoals,
        onePointFieldGoals: perf.onePointFieldGoals,
        twoPointFieldGoals: perf.twoPointFieldGoals,
        tryAssists: perf.tryAssists,
        lineBreakAssists: perf.lineBreakAssists,
        forcedDropOutKicks: perf.forcedDropOutKicks,
        fortyTwentyKicks: perf.fortyTwentyKicks,
        twentyFortyKicks: perf.twentyFortyKicks,
        kicksDead: perf.kicksDead,
        tackleBreaks: perf.tackleBreaks,
        lineBreaks: perf.lineBreaks,
        intercepts: perf.intercepts,
        tacklesMade: perf.tacklesMade,
        missedTackles: perf.missedTackles,
        penalties: perf.penalties,
        errors: perf.errors,
        sinBins: perf.sinBins,
        sendOffs: perf.sendOffs,
        offloads: perf.offloads,
        allRuns: perf.allRuns,
      });

      const score = computePlayerScore({ primary: primaryStats, supplementary, matchConfidence }, this.scoringConfig);

      // Derive opponent from the match record. match_performances.match_id stores domain IDs
      // (e.g. 2026-R1-NQL-SHA) so findById resolves directly.
      let opponent = '';
      if (this.matchRepository) {
        const matchRecord = await this.matchRepository.findById(perf.matchId);
        if (matchRecord) {
          opponent = matchRecord.homeTeamCode === perf.teamCode
            ? (matchRecord.awayTeamCode ?? '')
            : (matchRecord.homeTeamCode ?? '');
        }
      }

      matchEntries.push({
        ...score,
        opponent,
      });
    }

    // Batch-save new links
    if (linksToSave.length > 0 && this.linkRepo) {
      try {
        await this.linkRepo.saveBatch(linksToSave);
        logger.info('Auto-persisted player name links (single player)', { count: linksToSave.length, playerId });
      } catch (err) {
        logger.error('Failed to persist player name links', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    matchEntries.sort((a, b) => a.round - b.round);

    const seasonTotal = matchEntries.reduce((sum, m) => sum + m.totalScore, 0);
    const matchesPlayed = matchEntries.length;

    return {
      playerId: player.id,
      playerName: player.name,
      teamCode: player.teamCode,
      year,
      matches: matchEntries,
      seasonTotal,
      seasonAverage: matchesPlayed > 0 ? Math.round(seasonTotal / matchesPlayed) : 0,
      matchesPlayed,
    };
  }
}
