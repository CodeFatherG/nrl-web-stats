/**
 * NrlComCasualtyWardAdapter — implements CasualtyWardSource port.
 * Fetches casualty ward data from nrl.com's JSON API endpoint.
 *
 * Flow: /casualty-ward/data → Zod validate → CasualtyWardPlayerData[]
 */

import { z } from 'zod';
import type { CasualtyWardSource, CasualtyWardPlayerData } from '../../domain/ports/casualty-ward-source.js';
import type { Result } from '../../domain/result.js';
import { success, failure } from '../../domain/result.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Zod schemas for nrl.com casualty ward API response
// ---------------------------------------------------------------------------

const CasualtyPlayerSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  expectedReturn: z.string(),
  injury: z.string(),
  teamNickname: z.string(),
  url: z.string(),
  imageUrl: z.string().optional(),
  theme: z.object({ key: z.string() }).passthrough().optional(),
});

const CasualtyWardResponseSchema = z.object({
  casualties: z.array(CasualtyPlayerSchema),
  selectedCompetitionId: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

const NRL_COM_CASUALTY_WARD_API = 'https://www.nrl.com/casualty-ward/data';

export class NrlComCasualtyWardAdapter implements CasualtyWardSource {
  async fetchCasualtyWard(): Promise<Result<CasualtyWardPlayerData[]>> {
    try {
      const url = `${NRL_COM_CASUALTY_WARD_API}?competition=111`;
      logger.info('Fetching casualty ward from nrl.com', { url });

      const response = await fetch(url, {
        headers: { 'User-Agent': 'NRL-Schedule-Scraper/1.0' },
      });

      if (!response.ok) {
        return failure(`nrl.com casualty ward API returned HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      const parseResult = CasualtyWardResponseSchema.safeParse(json);

      if (!parseResult.success) {
        logger.error('nrl.com casualty ward response validation failed', {
          issues: parseResult.error.issues,
        });
        return failure(`nrl.com casualty ward validation failed: ${parseResult.error.issues[0].message}`);
      }

      const players: CasualtyWardPlayerData[] = parseResult.data.casualties.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        teamNickname: c.teamNickname,
        injury: c.injury,
        expectedReturn: c.expectedReturn,
        profileUrl: c.url,
      }));

      logger.info('Successfully fetched casualty ward from nrl.com', {
        playerCount: players.length,
      });

      return success(players);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch casualty ward from nrl.com', { error: message });
      return failure(`Failed to fetch casualty ward from nrl.com: ${message}`);
    }
  }
}
