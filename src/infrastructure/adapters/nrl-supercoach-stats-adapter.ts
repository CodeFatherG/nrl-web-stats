/**
 * NrlSupercoachStatsAdapter — implements SupplementaryStatsSource port.
 * Fetches per-round supplementary player stats from nrlsupercoachstats.com's jqGrid JSON endpoint.
 *
 * The endpoint returns rows as flat objects with named keys (e.g., Name2, Rd, LT, Score),
 * not cell arrays. Player name is in "Name2" (plain text, "LastName, FirstName" format).
 * Round is in "Rd" (zero-padded string like "01").
 *
 * IMPORTANT: All individual stat columns in the source (LT, MG, MF, OL, IO, H8, HU, KB, HG,
 * and primary-duplicate columns TR, TS, GO, TA, etc.) are POINT CONTRIBUTIONS, not raw stat
 * counts. They sum to the published Score. We divide by pointsPerUnit to recover raw counts.
 *
 * The TS column is "Try Assist Score" (tryAssists × 12), NOT "Try Saves". It duplicates the
 * primary tryAssists stat and is therefore ignored. The source has no dedicated try-saves column.
 */

import { z } from 'zod';
import type { SupplementaryStatsSource, SupplementaryPlayerStats } from '../../domain/ports/supplementary-stats-source.js';
import type { Result } from '../../domain/result.js';
import { success, failure } from '../../domain/result.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Zod validation schemas for jqGrid response
// ---------------------------------------------------------------------------

/** Each row is a flat object with named string properties */
const JqGridRowSchema = z.object({
  id: z.string(),
  Name2: z.string(),
  Team: z.string(),
  Rd: z.string(),
  Score: z.string(),
  LT: z.string().optional().default('0'),
  MG: z.string().optional().default('0'),
  MF: z.string().optional().default('0'),
  OL: z.string().optional().default('0'),
  IO: z.string().optional().default('0'),
  H8: z.string().optional().default('0'),
  HU: z.string().optional().default('0'),
  TS: z.string().optional().default('0'),
  KB: z.string().optional().default('0'),
  HG: z.string().optional().default('0'),
  Price: z.string().optional().default(''),
  BE: z.string().optional().default(''),
}).passthrough();

const JqGridResponseSchema = z.object({
  page: z.union([z.string(), z.number()]).transform(String),
  total: z.union([z.string(), z.number()]).transform(Number),
  records: z.union([z.string(), z.number()]).transform(String),
  rows: z.array(JqGridRowSchema),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPERCOACH_STATS_BASE = 'https://www.nrlsupercoachstats.com/stats.php';
const RATE_LIMIT_MS = 2000;
const ROWS_PER_PAGE = 500;

/**
 * Point-contribution divisors for supplementary-only columns.
 * Source columns contain (raw_count × points_per_unit). We divide to recover raw counts.
 * Must match the scoring config (src/config/scoring-tables/*.json).
 */
const POINTS_PER_UNIT = {
  LT: 4,   // lastTouch
  MG: -2,  // missedGoals
  MF: -1,  // missedFieldGoals
  OL: 4,   // effectiveOffloads
  IO: 2,   // ineffectiveOffloads
  H8: 2,   // runsOver8m
  HU: 1,   // runsUnder8m
  KB: 8,   // kickRegatherBreak
  HG: 3,   // heldUpInGoal
} as const;

// ---------------------------------------------------------------------------
// NrlSupercoachStatsAdapter
// ---------------------------------------------------------------------------

export class NrlSupercoachStatsAdapter implements SupplementaryStatsSource {
  async fetchSupplementaryStats(
    year: number,
    round: number
  ): Promise<Result<SupplementaryPlayerStats[]>> {
    try {
      const allStats: SupplementaryPlayerStats[] = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        if (currentPage > 1) {
          await this.delay(RATE_LIMIT_MS);
        }

        const url = this.buildUrl(year, currentPage);
        logger.info('Fetching supplementary stats', { url, year, round, page: currentPage });

        const response = await fetch(url, {
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0',
          },
        });

        if (!response.ok) {
          return failure(`nrlsupercoachstats.com returned HTTP ${response.status}`);
        }

        const json = await response.json();
        const parse = JqGridResponseSchema.safeParse(json);

        if (!parse.success) {
          return failure(`jqGrid response validation failed: ${parse.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
        }

        const data = parse.data;
        totalPages = data.total;

        // Filter rows by round and parse into SupplementaryPlayerStats
        for (const row of data.rows) {
          const rowRound = parseInt(row.Rd, 10) || 0;
          if (rowRound !== round) continue;

          const playerName = row.Name2;
          if (!playerName || !playerName.includes(',')) continue;

          allStats.push(this.parseRow(row, year, round));
        }

        currentPage++;
      } while (currentPage <= totalPages);

      logger.info('Successfully fetched supplementary stats', {
        year,
        round,
        players: allStats.length,
        pages: totalPages,
      });

      return success(allStats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch supplementary stats', { year, round, error: message });
      return failure(`Failed to fetch supplementary stats: ${message}`);
    }
  }

  private buildUrl(year: number, page: number): string {
    const url = new URL(SUPERCOACH_STATS_BASE);
    url.searchParams.set('year', String(year));
    url.searchParams.set('grid_id', 'list1');
    url.searchParams.set('jqgrid_page', String(page));
    url.searchParams.set('rows', String(ROWS_PER_PAGE));
    url.searchParams.set('sidx', 'Score');
    url.searchParams.set('sord', 'desc');
    return url.toString();
  }

  /** Parse a string to integer, defaulting to 0. */
  private toInt(value: string): number {
    return parseInt(value, 10) || 0;
  }

  /** Parse a string to integer, returning null if empty/missing. Used for non-scoring fields like price/BE. */
  private toNullableInt(value: string): number | null {
    if (!value || value.trim() === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /** Convert a point-contribution column back to a raw stat count. */
  private pointsToRaw(value: string, pointsPerUnit: number): number {
    const pts = this.toInt(value);
    if (pts === 0 || pointsPerUnit === 0) return 0;
    return Math.round(pts / pointsPerUnit);
  }

  private parseRow(
    row: z.infer<typeof JqGridRowSchema>,
    season: number,
    round: number
  ): SupplementaryPlayerStats {
    return {
      playerName: row.Name2,
      season,
      round,
      lastTouch: this.pointsToRaw(row.LT, POINTS_PER_UNIT.LT),
      missedGoals: this.pointsToRaw(row.MG, POINTS_PER_UNIT.MG),
      missedFieldGoals: this.pointsToRaw(row.MF, POINTS_PER_UNIT.MF),
      effectiveOffloads: this.pointsToRaw(row.OL, POINTS_PER_UNIT.OL),
      ineffectiveOffloads: this.pointsToRaw(row.IO, POINTS_PER_UNIT.IO),
      runsOver8m: this.pointsToRaw(row.H8, POINTS_PER_UNIT.H8),
      runsUnder8m: this.pointsToRaw(row.HU, POINTS_PER_UNIT.HU),
      trySaves: 0, // TS column is "Try Assist Score" (primary duplicate), not try saves
      kickRegatherBreak: this.pointsToRaw(row.KB, POINTS_PER_UNIT.KB),
      heldUpInGoal: this.pointsToRaw(row.HG, POINTS_PER_UNIT.HG),
      price: this.toNullableInt(row.Price),
      breakEven: this.toNullableInt(row.BE),
      teamCode: row.Team || null,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
