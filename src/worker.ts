import { Hono } from 'hono';
import { createApiRoutes } from './api/routes.js';
import { setDebugMode, logger } from './utils/logger.js';
import { cacheStore, getNextMondayExpiry } from './cache/store.js';
import { SuperCoachStatsAdapter } from './infrastructure/adapters/supercoach-stats-adapter.js';
import { NrlComMatchResultAdapter } from './infrastructure/adapters/nrl-com-match-result-adapter.js';
import { D1MatchRepository } from './infrastructure/persistence/d1-match-repository.js';
import { InMemoryMatchRepository } from './database/in-memory-match-repository.js';
import { ScrapeDrawUseCase } from './application/use-cases/scrape-draw.js';
import { ScrapeMatchResultsUseCase, findRoundsNeedingScrape } from './application/use-cases/scrape-match-results.js';
import { cacheServiceAdapter } from './application/adapters/cache-service-adapter.js';
import { resultCacheStore } from './cache/result-cache.js';
import { D1PlayerRepository } from './infrastructure/persistence/d1-player-repository.js';
import { NrlComPlayerStatsAdapter } from './infrastructure/adapters/nrl-com-player-stats-adapter.js';
import { ScrapePlayerStatsUseCase } from './application/use-cases/scrape-player-stats.js';
import { AnalyticsCache } from './analytics/analytics-cache.js';
import { GetTeamFormUseCase } from './application/use-cases/get-team-form.js';
import { GetMatchOutlookUseCase } from './application/use-cases/get-match-outlook.js';
import { GetPlayerTrendsUseCase } from './application/use-cases/get-player-trends.js';
import { GetCompositionImpactUseCase } from './application/use-cases/get-composition-impact.js';
import { fixtureRepositoryAdapter } from './application/adapters/fixture-repository-adapter.js';
import { buildLegacyFixtureBridge } from './database/legacy-fixture-bridge.js';
import type { HandlerDeps } from './api/handlers.js';

// Environment bindings type
export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  DB: D1Database;
}

// Stateless module-level singletons
const dataSource = new SuperCoachStatsAdapter();
const matchResultSource = new NrlComMatchResultAdapter();
const playerStatsSource = new NrlComPlayerStatsAdapter();
const analyticsCache = new AnalyticsCache();
const createPlayerRepo = (db: D1Database) => new D1PlayerRepository(db);

// D1-dependent deps — lazily initialized on first request when env.DB is available
let depsInitialized = false;
let legacyStoreHydrated = false;
const deps = {} as HandlerDeps;

function initializeDeps(db?: D1Database): void {
  if (depsInitialized) return;

  // Use D1 when available, fall back to in-memory for environments without D1 (e.g. tests)
  const matchRepository = db ? new D1MatchRepository(db) : new InMemoryMatchRepository();

  Object.assign(deps, {
    scrapeDrawUseCase: new ScrapeDrawUseCase(cacheServiceAdapter, dataSource, matchRepository),
    scrapeMatchResultsUseCase: new ScrapeMatchResultsUseCase(matchResultSource, matchRepository, resultCacheStore),
    matchRepository,
    createPlayerRepository: createPlayerRepo,
    createScrapePlayerStatsUseCase: (reqDb: D1Database) =>
      new ScrapePlayerStatsUseCase(playerStatsSource, new D1PlayerRepository(reqDb)),
    getTeamFormUseCase: new GetTeamFormUseCase(matchRepository, fixtureRepositoryAdapter, analyticsCache),
    getMatchOutlookUseCase: new GetMatchOutlookUseCase(matchRepository, fixtureRepositoryAdapter, analyticsCache),
    getPlayerTrendsUseCase: new GetPlayerTrendsUseCase(createPlayerRepo, analyticsCache),
    getCompositionImpactUseCase: new GetCompositionImpactUseCase(matchRepository, createPlayerRepo, analyticsCache),
  } satisfies HandlerDeps);

  depsInitialized = true;
}

/** Hydrate the legacy in-memory fixture store from D1 on cold start.
 *  Strength ratings are persisted in D1 so no external fetch is needed. */
async function hydrateLegacyStore(): Promise<void> {
  if (legacyStoreHydrated) return;
  legacyStoreHydrated = true;

  try {
    const years = await deps.matchRepository.getLoadedYears();
    for (const year of years) {
      const matches = await deps.matchRepository.findByYear(year);
      buildLegacyFixtureBridge(year, matches);
    }
    if (years.length > 0) {
      logger.info('Legacy fixture store hydrated from D1', { years });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to hydrate legacy fixture store', { error: message });
  }
}

/** Check if strength ratings are stale (past Monday 4pm AEST) and refresh from SuperCoach.
 *  Only updates non-completed matches; completed match ratings are frozen in D1. */
let ratingsLastRefreshed: Date | null = null;

async function refreshRatingsIfStale(): Promise<void> {
  const now = new Date();

  // On first request, use D1 data as-is (already hydrated). Track "now" as baseline.
  if (ratingsLastRefreshed === null) {
    ratingsLastRefreshed = now;
    return;
  }

  // Check if a Monday 4pm AEST boundary has passed since last refresh
  const nextExpiry = getNextMondayExpiry(ratingsLastRefreshed);
  if (now < nextExpiry) return;

  ratingsLastRefreshed = now;

  try {
    const years = await deps.matchRepository.getLoadedYears();
    for (const year of years) {
      await deps.scrapeDrawUseCase.execute(year, true);
    }
    if (years.length > 0) {
      logger.info('Strength ratings refreshed from SuperCoach', { years });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to refresh strength ratings', { error: message });
  }
}

const app = new Hono<{ Bindings: Env }>();

// Initialize logger and D1-dependent deps on first request
app.use('*', async (c, next) => {
  setDebugMode(c.env?.ENVIRONMENT !== 'production');
  initializeDeps(c.env?.DB);
  await hydrateLegacyStore();
  await refreshRatingsIfStale();
  await next();
});

// Mount API routes under /api — deps is populated by middleware before any handler runs
app.route('/api', createApiRoutes(deps));

// Static file serving and SPA fallback
// Handled by Cloudflare Workers Sites via wrangler.jsonc [site] config
// Non-API routes will be served from the static assets bucket
app.get('*', async (c) => {
  // In production, Cloudflare Workers Sites handles static files
  // This is a fallback for local development
  const url = new URL(c.req.url);

  // Try to serve from ASSETS binding if available
  if (c.env?.ASSETS) {
    try {
      const response = await c.env.ASSETS.fetch(c.req.raw);
      if (response.status !== 404) {
        return response;
      }
    } catch {
      // Fall through to index.html
    }
    // SPA fallback - serve index.html for client-side routing
    const indexRequest = new Request(new URL('/index.html', url.origin));
    return c.env.ASSETS.fetch(indexRequest);
  }

  // Development fallback
  return c.text('Static file serving requires ASSETS binding', 404);
});

// Export for Cloudflare Workers
export default app;

// Scheduled handler for cache invalidation and post-game result scraping
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  logger.info('Scheduled trigger fired', {
    timestamp: new Date().toISOString(),
    scheduledTime: new Date(event.scheduledTime).toISOString(),
    cron: event.cron,
  });

  // Monday cache invalidation (existing behavior)
  if (event.cron === '0 6 * * 1') {
    cacheStore.invalidateAll();
    logger.info('Cache invalidated by Monday scheduled trigger');
    return;
  }

  // Ensure deps are initialized for scheduled handler
  initializeDeps(env.DB);
  const matchRepository = deps.matchRepository;

  // Post-game result scraping: find rounds with completed games needing scrape
  const currentTime = new Date(event.scheduledTime);
  const roundsToScrape = await findRoundsNeedingScrape(matchRepository, currentTime);

  if (roundsToScrape.length === 0) {
    logger.debug('No rounds need result scraping');
    return;
  }

  logger.info('Scraping results for completed rounds', {
    rounds: roundsToScrape,
  });

  // Create per-request player stats use case with D1 binding
  const scrapePlayerStatsUseCase = new ScrapePlayerStatsUseCase(
    playerStatsSource,
    new D1PlayerRepository(env.DB)
  );

  for (const { year, round } of roundsToScrape) {
    ctx.waitUntil(
      deps.scrapeMatchResultsUseCase.execute(year, round).then(result => {
        logger.info('Scheduled result scrape complete', {
          year,
          round,
          success: result.success,
          enriched: result.enrichedCount,
          created: result.createdCount,
        });

        // After match results are scraped, also scrape player stats
        return scrapePlayerStatsUseCase.execute(year, round).then(playerResult => {
          logger.info('Scheduled player stats scrape complete', {
            year,
            round,
            playersProcessed: playerResult.playersProcessed,
            created: playerResult.created,
            updated: playerResult.updated,
          });
        });
      }).catch(error => {
        logger.error('Scheduled scrape failed', {
          year,
          round,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      })
    );
  }
};
