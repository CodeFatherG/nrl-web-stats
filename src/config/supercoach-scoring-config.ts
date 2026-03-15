/**
 * Supercoach scoring configuration loader.
 * Loads season-specific scoring tables from JSON files and validates via Zod.
 */

import { z } from 'zod';
import type { ScoringCategory } from '../domain/supercoach-score.js';

// ---------------------------------------------------------------------------
// Zod schemas for scoring config validation
// ---------------------------------------------------------------------------

const ScoringCategorySchema = z.enum([
  'scoring', 'create', 'evade', 'base', 'defence', 'negative',
]);

const ScoringEntrySchema = z.object({
  statName: z.string().min(1),
  displayName: z.string().min(1),
  points: z.number().int(),
  category: ScoringCategorySchema,
  source: z.enum(['primary', 'supplementary', 'both']),
});

const ScoringConfigSchema = z.object({
  season: z.number().int().min(2020).max(2099),
  stats: z.array(ScoringEntrySchema).min(1),
});

// ---------------------------------------------------------------------------
// Types derived from Zod schemas
// ---------------------------------------------------------------------------

export type ScoringEntry = z.infer<typeof ScoringEntrySchema>;
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

// ---------------------------------------------------------------------------
// Scoring table data (imported at build time)
// ---------------------------------------------------------------------------

import config2026 from './scoring-tables/2026.json';

const SCORING_TABLES: Record<number, unknown> = {
  2026: config2026,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load and validate a season's scoring configuration */
export function loadScoringConfig(year: number): ScoringConfig {
  const raw = SCORING_TABLES[year];
  if (!raw) {
    throw new Error(
      `No scoring configuration for season ${year}. Available: ${Object.keys(SCORING_TABLES).join(', ')}`
    );
  }

  const result = ScoringConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid scoring configuration for ${year}: ${result.error.issues[0].message}`
    );
  }

  return result.data;
}

/** Find a scoring entry by stat name */
export function getScoringEntryByName(
  config: ScoringConfig,
  statName: string
): ScoringEntry | undefined {
  return config.stats.find(e => e.statName === statName);
}

/** Get all scoring entries for a given category */
export function getEntriesByCategory(
  config: ScoringConfig,
  category: ScoringCategory
): ScoringEntry[] {
  return config.stats.filter(e => e.category === category);
}

/** Get all available season years */
export function getAvailableSeasons(): number[] {
  return Object.keys(SCORING_TABLES).map(Number).sort();
}
