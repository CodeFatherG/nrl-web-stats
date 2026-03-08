/**
 * Zod validation schemas for API requests and responses
 */

import { z } from 'zod';
import { VALID_TEAM_CODES } from './team.js';

/** Schema for scrape request - min 1998 (first NRL season), no max limit */
export const ScrapeRequestSchema = z.object({
  year: z.number().int().min(1998),
  force: z.boolean().optional(),
});

/** Schema for fixture query parameters */
export const FixtureQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  team: z.string().length(3).toUpperCase().optional(),
  round: z.coerce.number().int().min(1).max(27).optional(),
  roundStart: z.coerce.number().int().min(1).max(27).optional(),
  roundEnd: z.coerce.number().int().min(1).max(27).optional(),
  home: z.coerce.boolean().optional(),
  away: z.coerce.boolean().optional(),
  byes: z.coerce.boolean().optional(),
  opponent: z.string().length(3).toUpperCase().optional(),
});

/** Schema for team code parameter */
export const TeamCodeSchema = z.string().length(3).toUpperCase().refine(
  (code) => VALID_TEAM_CODES.includes(code),
  { message: 'Invalid team code' }
);

/** Schema for round parameter */
export const RoundSchema = z.coerce.number().int().min(1).max(27);

/** Schema for year parameter - min 1998 (first NRL season), no max limit */
export const YearSchema = z.coerce.number().int().min(1998);

/** Schema for season summary year parameter - no max, actual validation is isYearLoaded() */
export const SeasonSummaryParamsSchema = z.object({
  year: z.coerce.number().int().min(1998),
});

/** Schema for analytics form/composition path params: year + teamCode */
export const AnalyticsFormParamsSchema = z.object({
  year: z.coerce.number().int().min(1998),
  teamCode: z.string().length(3).toUpperCase().refine(
    (code) => VALID_TEAM_CODES.includes(code),
    { message: 'Invalid team code' }
  ),
});

/** Schema for analytics form query params */
export const AnalyticsFormQuerySchema = z.object({
  window: z.coerce.number().int().min(1).max(27).optional().default(5),
});

/** Schema for analytics player trends query params */
export const AnalyticsTrendsQuerySchema = z.object({
  window: z.coerce.number().int().min(1).max(27).optional().default(5),
  significantOnly: z.coerce.boolean().optional().default(false),
});

/** Schema for analytics outlook path params: year + round */
export const AnalyticsOutlookParamsSchema = z.object({
  year: z.coerce.number().int().min(1998),
  round: z.coerce.number().int().min(1).max(27),
});

/** Schema for analytics outlook query params */
export const AnalyticsOutlookQuerySchema = z.object({
  window: z.coerce.number().int().min(1).max(27).optional().default(5),
});

/** Schema for analytics composition path params (same as form params) */
export const AnalyticsCompositionParamsSchema = z.object({
  year: z.coerce.number().int().min(1998),
  teamCode: z.string().length(3).toUpperCase().refine(
    (code) => VALID_TEAM_CODES.includes(code),
    { message: 'Invalid team code' }
  ),
});

/** Type inference helpers */
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;
export type FixtureQuery = z.infer<typeof FixtureQuerySchema>;
export type SeasonSummaryParams = z.infer<typeof SeasonSummaryParamsSchema>;
export type AnalyticsFormParams = z.infer<typeof AnalyticsFormParamsSchema>;
export type AnalyticsFormQuery = z.infer<typeof AnalyticsFormQuerySchema>;
export type AnalyticsTrendsQuery = z.infer<typeof AnalyticsTrendsQuerySchema>;
export type AnalyticsOutlookParams = z.infer<typeof AnalyticsOutlookParamsSchema>;
export type AnalyticsOutlookQuery = z.infer<typeof AnalyticsOutlookQuerySchema>;
export type AnalyticsCompositionParams = z.infer<typeof AnalyticsCompositionParamsSchema>;
