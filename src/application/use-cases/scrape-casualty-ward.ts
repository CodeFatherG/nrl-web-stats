/**
 * ScrapeCasualtyWardUseCase — fetches casualty ward data from an external source,
 * compares against existing open records, and applies change detection:
 * - New players → insert new record with today as start date
 * - Missing players → close record with today as end date
 * - Changed injury/expectedReturn → update existing record
 * - Unchanged players → no action (no duplicates)
 */

import type { CasualtyWardSource, CasualtyWardPlayerData } from '../../domain/ports/casualty-ward-source.js';
import type { CasualtyWardRepository } from '../../domain/repositories/casualty-ward-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { CasualtyWardEntry } from '../../domain/casualty-ward-entry.js';
import { createCasualtyWardEntry } from '../../domain/casualty-ward-entry.js';
import { resolveTeamNickname } from '../../infrastructure/shared/nrl-team-nickname-map.js';
import { normalizeName } from '../../config/player-name-matcher.js';
import type { Warning } from '../../models/types.js';
import { logger } from '../../utils/logger.js';

/** Result of a casualty ward scrape operation */
export interface ScrapeCasualtyWardResult {
  success: boolean;
  newEntries: number;
  closedEntries: number;
  updatedEntries: number;
  totalOpen: number;
  warnings: Warning[];
}

/** Build a composite key for matching players across scrapes */
function playerKey(firstName: string, lastName: string, teamCode: string): string {
  return `${firstName.toLowerCase().trim()}|${lastName.toLowerCase().trim()}|${teamCode}`;
}

export class ScrapeCasualtyWardUseCase {
  constructor(
    private readonly source: CasualtyWardSource,
    private readonly repository: CasualtyWardRepository,
    private readonly playerRepository?: PlayerRepository
  ) {}

  /** Build a team → Map<normalizedName, playerId> lookup from the players table */
  private async buildPlayerLookup(teamCodes: string[]): Promise<Map<string, string>> {
    const lookup = new Map<string, string>();
    if (!this.playerRepository) return lookup;

    for (const teamCode of teamCodes) {
      const players = await this.playerRepository.findByTeam(teamCode);
      for (const player of players) {
        lookup.set(`${teamCode}|${normalizeName(player.name)}`, player.id);
      }
    }
    return lookup;
  }

  async execute(today?: string): Promise<ScrapeCasualtyWardResult> {
    const currentDate = today ?? new Date().toISOString().split('T')[0];
    const warnings: Warning[] = [];
    let newEntries = 0;
    let closedEntries = 0;
    let updatedEntries = 0;

    // Step 1: Fetch current casualty ward from source
    const fetchResult = await this.source.fetchCasualtyWard();
    if (!fetchResult.success) {
      logger.error('[CASUALTY-WARD] Failed to fetch', { error: fetchResult.error });
      return { success: false, newEntries: 0, closedEntries: 0, updatedEntries: 0, totalOpen: 0, warnings: [] };
    }

    warnings.push(...fetchResult.warnings);

    // Step 2: Resolve team nicknames → canonical codes
    const resolvedPlayers: Array<CasualtyWardPlayerData & { teamCode: string }> = [];
    for (const player of fetchResult.data) {
      const teamCode = resolveTeamNickname(player.teamNickname);
      if (!teamCode) {
        warnings.push({
          type: 'CASUALTY_WARD_UNKNOWN_TEAM',
          message: `Unknown team nickname: ${player.teamNickname} for ${player.firstName} ${player.lastName}`,
          context: { firstName: player.firstName, lastName: player.lastName, teamNickname: player.teamNickname },
        });
        continue;
      }
      resolvedPlayers.push({ ...player, teamCode });
    }

    // Step 3: Load all open records from DB
    const openRecords = await this.repository.findOpen();

    // Step 4: Build lookup maps
    const openByKey = new Map<string, CasualtyWardEntry>();
    for (const record of openRecords) {
      const key = playerKey(record.firstName, record.lastName, record.teamCode);
      openByKey.set(key, record);
    }

    const uniqueTeamCodes = [...new Set(resolvedPlayers.map(p => p.teamCode))];
    const playerLookup = await this.buildPlayerLookup(uniqueTeamCodes);

    const scrapedKeys = new Set<string>();

    // Step 5: Process each scraped player
    for (const player of resolvedPlayers) {
      const key = playerKey(player.firstName, player.lastName, player.teamCode);
      scrapedKeys.add(key);

      const existing = openByKey.get(key);
      const resolvedPlayerId = playerLookup.get(
        `${player.teamCode}|${normalizeName(player.firstName + ' ' + player.lastName)}`
      ) ?? null;

      if (existing) {
        const needsUpdate =
          existing.injury !== player.injury ||
          existing.expectedReturn !== player.expectedReturn ||
          (existing.playerId === null && resolvedPlayerId !== null);

        if (needsUpdate) {
          await this.repository.update({
            ...existing,
            injury: player.injury,
            expectedReturn: player.expectedReturn,
            playerId: existing.playerId ?? resolvedPlayerId,
          });
          updatedEntries++;
        }
        // Otherwise unchanged — no action
      } else {
        // Check whether this player was closed today — if so, the source is flapping
        // (removed then re-added the same player within a short window). Re-open the
        // existing entry rather than creating a zero-duration duplicate.
        const recentlyClosed = await this.repository.findRecentlyClosedByKey(
          player.firstName,
          player.lastName,
          player.teamCode,
          currentDate
        );

        const isSameInjury = recentlyClosed !== null &&
          recentlyClosed.injury.toLowerCase().trim() === player.injury.toLowerCase().trim();

        if (recentlyClosed && recentlyClosed.id !== null && isSameInjury) {
          // Same player, same injury, closed today — source is flapping. Reopen.
          await this.repository.reopen(recentlyClosed.id);
          // Backfill playerId if it was missing
          if (recentlyClosed.playerId === null && resolvedPlayerId !== null) {
            await this.repository.update({
              ...recentlyClosed,
              endDate: null,
              playerId: resolvedPlayerId,
            });
          }
          logger.info('[CASUALTY-WARD] Reopened flapping entry', {
            id: recentlyClosed.id,
            firstName: player.firstName,
            lastName: player.lastName,
            teamCode: player.teamCode,
          });
        } else {
          // Genuinely new player on casualty ward — create record
          const entry = createCasualtyWardEntry({
            firstName: player.firstName,
            lastName: player.lastName,
            teamCode: player.teamCode,
            injury: player.injury,
            expectedReturn: player.expectedReturn,
            startDate: currentDate,
            playerId: resolvedPlayerId,
          });
          await this.repository.insert(entry);
          newEntries++;
        }
      }
    }

    // Step 6: Close records for players no longer on casualty ward
    for (const record of openRecords) {
      const key = playerKey(record.firstName, record.lastName, record.teamCode);
      if (!scrapedKeys.has(key) && record.id !== null) {
        await this.repository.close(record.id, currentDate);
        closedEntries++;
      }
    }

    const totalOpen = resolvedPlayers.length;

    logger.info('[CASUALTY-WARD] Scrape complete', {
      newEntries,
      closedEntries,
      updatedEntries,
      totalOpen,
      warnings: warnings.length,
    });

    return { success: true, newEntries, closedEntries, updatedEntries, totalOpen, warnings };
  }
}
