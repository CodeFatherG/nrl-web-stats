/**
 * Zod validation schemas for API requests and responses
 */

import { z } from 'zod';
import { VALID_TEAM_CODES } from './team.js';

/** Schema for scrape request */
export const ScrapeRequestSchema = z.object({
  year: z.number().int().min(2010).max(2030),
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

/** Schema for year parameter */
export const YearSchema = z.coerce.number().int().min(2010).max(2030);

/** Type inference helpers */
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;
export type FixtureQuery = z.infer<typeof FixtureQuerySchema>;
