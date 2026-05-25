/**
 * Database store — owns the static teams registry and the async fixture
 * accessors that delegate to the injected FixtureRepository.
 *
 * The in-RAM fixture cache (CacheStore-era indexes) is gone after spec 038.
 * Fixture reads now go through the durable repository; this module is the
 * chokepoint where stale-artifact observability is emitted.
 */

import type { Fixture } from '../models/fixture.js';
import type { Team } from '../models/team.js';
import type { FixtureRepository } from '../domain/repositories/fixture-repository.js';
import { TEAM_NAMES, VALID_TEAM_CODES } from '../models/team.js';
import { logger } from '../utils/logger.js';

interface DatabaseState {
  teams: Map<string, Team>;
}

let db: DatabaseState | null = null;
let injectedRepository: FixtureRepository | null = null;

/**
 * Inject the FixtureRepository used by every fixture accessor below.
 * Called once during composition-root initialisation in worker.ts.
 */
export function setFixtureRepository(repo: FixtureRepository): void {
  injectedRepository = repo;
}

function requireRepository(): FixtureRepository {
  if (!injectedRepository) {
    throw new Error(
      'FixtureRepository not initialised — call setFixtureRepository() from the composition root before any read.',
    );
  }
  return injectedRepository;
}

/** Initialise or get the database (teams registry only). */
export function getDatabase(): DatabaseState {
  if (!db) {
    db = { teams: new Map() };
    for (const code of VALID_TEAM_CODES) {
      db.teams.set(code, { code, name: TEAM_NAMES[code] });
    }
    logger.info('Database initialized', { teamCount: db.teams.size });
  }
  return db;
}

/** 8 days in milliseconds — the stale-warn threshold (one day past the
 *  weekly cron cadence). See research.md Decision 3. */
const STALE_WARN_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000;

function warnIfStale(year: number, lastScrapedAt: string): void {
  const ageMs = Date.now() - Date.parse(lastScrapedAt);
  if (!Number.isFinite(ageMs)) return;
  if (ageMs > STALE_WARN_THRESHOLD_MS) {
    logger.warn('fixture-artifact-stale', {
      year,
      lastScrapedAt,
      ageDays: Math.round(ageMs / (24 * 60 * 60 * 1000)),
    });
  }
}

/** Get fixtures by year via the injected repository. Returns `[]` on miss
 *  (artifact absent). Emits a `warn` log when the artifact is older than
 *  8 days. */
export async function getFixturesByYear(year: number): Promise<Fixture[]> {
  const artifact = await requireRepository().findByYear(year);
  if (!artifact) return [];
  warnIfStale(year, artifact.freshness.lastScrapedAt);
  return [...artifact.payload];
}

/** Get fixtures by year + team via the injected repository. Returns `[]` on
 *  miss or when the team has zero rows in the year's artifact. */
export async function getFixturesByYearTeam(
  year: number,
  teamCode: string,
): Promise<Fixture[]> {
  const artifact = await requireRepository().findByYearAndTeam(year, teamCode);
  if (!artifact) return [];
  return [...artifact.payload];
}

/** Async year → lastScrapedAt ISO map, derived from the repository. */
export async function getLastScrapeTimes(): Promise<Record<string, string>> {
  const map = await requireRepository().listScrapedYears();
  const result: Record<string, string> = {};
  for (const [year, ts] of map) result[year.toString()] = ts;
  return result;
}

/** All static team rows (deterministic order). */
export function getAllTeamsFromDb(): Team[] {
  return Array.from(getDatabase().teams.values());
}

/** Static team lookup. */
export function getTeamByCode(code: string): Team | undefined {
  return getDatabase().teams.get(code.toUpperCase());
}

/** Reset state — used in tests. Clears teams registry and forgets the
 *  injected repository. */
export function resetDatabase(): void {
  db = null;
  injectedRepository = null;
  logger.info('Database reset');
}
