import { Hono } from 'hono';
import { createApiRoutes } from './api/routes.js';
import { setDebugMode, logger } from './utils/logger.js';
import { cacheStore, getNextMondayExpiry } from './cache/store.js';
import { SuperCoachStatsAdapter } from './infrastructure/adapters/supercoach-stats-adapter.js';
import { NrlComMatchResultAdapter } from './infrastructure/adapters/nrl-com-match-result-adapter.js';
import { D1MatchRepository } from './infrastructure/persistence/d1-match-repository.js';
import { InMemoryMatchRepository } from './database/in-memory-match-repository.js';
import { ScrapeDrawUseCase } from './application/use-cases/scrape-draw.js';
import { ScrapeMatchResultsUseCase, findRoundsNeedingScrape, findRoundsNeedingPlayerStats, findRoundsNeedingSupplementaryStats } from './application/use-cases/scrape-match-results.js';
import { cacheServiceAdapter } from './application/adapters/cache-service-adapter.js';
import { resultCacheStore } from './cache/result-cache.js';
import { D1PlayerRepository } from './infrastructure/persistence/d1-player-repository.js';
import { NrlComPlayerStatsAdapter } from './infrastructure/adapters/nrl-com-player-stats-adapter.js';
import { ScrapePlayerStatsUseCase } from './application/use-cases/scrape-player-stats.js';
import { NrlSupercoachStatsAdapter } from './infrastructure/adapters/nrl-supercoach-stats-adapter.js';
import { D1SupplementaryStatsRepository } from './infrastructure/persistence/d1-supplementary-stats-repo.js';
import { ScrapeSupplementaryStatsUseCase } from './application/use-cases/scrape-supplementary-stats.js';
import { GetSupercoachScoresUseCase } from './application/use-cases/get-supercoach-scores.js';
import { D1PlayerNameLinkRepository } from './infrastructure/persistence/d1-player-name-link-repo.js';
import { loadScoringConfig } from './config/supercoach-scoring-config.js';
import { AnalyticsCache } from './analytics/analytics-cache.js';
import { NrlComTeamListAdapter } from './infrastructure/adapters/nrl-com-team-list-adapter.js';
import { D1TeamListRepository } from './infrastructure/persistence/d1-team-list-repository.js';
import { ScrapeTeamListsUseCase } from './application/use-cases/scrape-team-lists.js';
import { ScrapeCasualtyWardUseCase } from './application/use-cases/scrape-casualty-ward.js';
import { NrlComCasualtyWardAdapter } from './infrastructure/adapters/nrl-com-casualty-ward-adapter.js';
import { D1CasualtyWardRepository } from './infrastructure/persistence/d1-casualty-ward-repository.js';
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
const supplementaryStatsSource = new NrlSupercoachStatsAdapter();
const teamListSource = new NrlComTeamListAdapter();
const casualtyWardSource = new NrlComCasualtyWardAdapter();
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
    createScrapeSupplementaryStatsUseCase: (reqDb: D1Database) =>
      new ScrapeSupplementaryStatsUseCase(supplementaryStatsSource, new D1SupplementaryStatsRepository(reqDb)),
    createGetSupercoachScoresUseCase: (reqDb: D1Database) =>
      new GetSupercoachScoresUseCase(
        new D1PlayerRepository(reqDb),
        new D1SupplementaryStatsRepository(reqDb),
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      ),
    createScrapeTeamListsUseCase: (reqDb: D1Database) =>
      new ScrapeTeamListsUseCase(teamListSource, new D1TeamListRepository(reqDb), matchRepository),
    createTeamListRepository: (reqDb: D1Database) => new D1TeamListRepository(reqDb),
    createScrapeCasualtyWardUseCase: (reqDb: D1Database) =>
      new ScrapeCasualtyWardUseCase(casualtyWardSource, new D1CasualtyWardRepository(reqDb)),
    createCasualtyWardRepository: (reqDb: D1Database) => new D1CasualtyWardRepository(reqDb),
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

// Scheduled handler for cache invalidation and post-game result scraping
const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  logger.info('[CRON] Scheduled trigger fired', {
    timestamp: new Date().toISOString(),
    scheduledTime: new Date(event.scheduledTime).toISOString(),
    cron: event.cron,
    environment: env.ENVIRONMENT,
    hasDB: !!env.DB,
  });

  // Monday cache invalidation (existing behavior)
  if (event.cron === '0 6 * * MON') {
    cacheStore.invalidateAll();
    logger.info('[CRON] Cache invalidated by Monday scheduled trigger');
    return;
  }

  // Ensure deps are initialized for scheduled handler
  logger.info('[CRON] Initializing deps', { depsAlreadyInitialized: depsInitialized });
  initializeDeps(env.DB);
  const matchRepository = deps.matchRepository;

  // Log loaded years to verify D1 connectivity
  const loadedYears = await matchRepository.getLoadedYears();
  const matchCount = await matchRepository.getMatchCount();
  logger.info('[CRON] D1 state', { loadedYears, matchCount });

  // Post-game result scraping: find rounds with completed games needing scrape
  const currentTime = new Date(event.scheduledTime);
  const roundsToScrape = await findRoundsNeedingScrape(matchRepository, currentTime);

  logger.info('[CRON] findRoundsNeedingScrape result', {
    currentTime: currentTime.toISOString(),
    roundsToScrape,
    count: roundsToScrape.length,
  });

  // Create per-request use cases with D1 binding
  const scrapePlayerStatsUseCase = new ScrapePlayerStatsUseCase(
    playerStatsSource,
    new D1PlayerRepository(env.DB)
  );
  const scrapeSupplementaryUseCase = new ScrapeSupplementaryStatsUseCase(
    supplementaryStatsSource,
    new D1SupplementaryStatsRepository(env.DB)
  );

  for (const { year, round } of roundsToScrape) {
    try {
      logger.info('[CRON] Starting match results scrape', { year, round });
      const result = await deps.scrapeMatchResultsUseCase.execute(year, round);
      logger.info('[CRON] Match results scrape complete', {
        year,
        round,
        success: result.success,
        enriched: result.enrichedCount,
        created: result.createdCount,
        skipped: result.skippedCount,
        warnings: result.warnings.length,
      });

      // After match results are scraped, also scrape player stats
      logger.info('[CRON] Starting player stats scrape', { year, round });
      const playerResult = await scrapePlayerStatsUseCase.execute(year, round, true);
      logger.info('[CRON] Player stats scrape complete', {
        year,
        round,
        playersProcessed: playerResult.playersProcessed,
        matchesScraped: playerResult.matchesScraped,
        created: playerResult.created,
        updated: playerResult.updated,
        skipped: playerResult.skipped,
        warnings: playerResult.warnings.length,
      });

      // Also scrape supplementary stats (may fail if source lags 24-48h — non-fatal)
      try {
        logger.info('[CRON] Starting supplementary stats scrape', { year, round });
        const suppResult = await scrapeSupplementaryUseCase.execute(year, round);
        logger.info('[CRON] Supplementary stats scrape complete', {
          year,
          round,
          playersScraped: suppResult.playersScraped,
          cached: suppResult.cached,
        });
      } catch (suppError) {
        logger.error('[CRON] Supplementary stats scrape failed (will retry next cycle)', {
          year,
          round,
          error: suppError instanceof Error ? suppError.message : 'Unknown error',
          stack: suppError instanceof Error ? suppError.stack : undefined,
        });
      }
    } catch (error) {
      logger.error('[CRON] Scheduled scrape failed', {
        year,
        round,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  // Also find completed rounds missing player stats
  const playerRepo = new D1PlayerRepository(env.DB);
  const roundsNeedingPlayerStats = await findRoundsNeedingPlayerStats(matchRepository, playerRepo);

  logger.info('[CRON] findRoundsNeedingPlayerStats result', {
    rounds: roundsNeedingPlayerStats,
    count: roundsNeedingPlayerStats.length,
  });

  // Scrape player stats for completed rounds that were missed (e.g. match results
  // were scraped via the UI before the cron had a chance to trigger player stats)
  const alreadyQueued = new Set(roundsToScrape.map(r => `${r.year}-${r.round}`));
  const playerStatsOnly = roundsNeedingPlayerStats.filter(
    r => !alreadyQueued.has(`${r.year}-${r.round}`)
  );

  logger.info('[CRON] Player stats backfill candidates', {
    total: roundsNeedingPlayerStats.length,
    alreadyQueued: alreadyQueued.size,
    backfillCount: playerStatsOnly.length,
    rounds: playerStatsOnly,
  });

  if (playerStatsOnly.length > 0) {
    for (const { year, round } of playerStatsOnly) {
      try {
        logger.info('[CRON] Starting backfill player stats scrape', { year, round });
        const playerResult = await scrapePlayerStatsUseCase.execute(year, round, true);
        logger.info('[CRON] Backfill player stats scrape complete', {
          year,
          round,
          playersProcessed: playerResult.playersProcessed,
          matchesScraped: playerResult.matchesScraped,
          created: playerResult.created,
          updated: playerResult.updated,
          skipped: playerResult.skipped,
          warnings: playerResult.warnings.length,
        });

        // Also backfill supplementary stats (non-fatal)
        try {
          const suppResult = await scrapeSupplementaryUseCase.execute(year, round);
          logger.info('[CRON] Backfill supplementary stats scrape complete', {
            year,
            round,
            playersScraped: suppResult.playersScraped,
            cached: suppResult.cached,
          });
        } catch (suppError) {
          logger.error('[CRON] Backfill supplementary stats scrape failed (will retry next cycle)', {
            year,
            round,
            error: suppError instanceof Error ? suppError.message : 'Unknown error',
            stack: suppError instanceof Error ? suppError.stack : undefined,
          });
        }
      } catch (error) {
        logger.error('[CRON] Backfill player stats scrape failed', {
          year,
          round,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  // Independent supplementary stats discovery
  const suppRepo = new D1SupplementaryStatsRepository(env.DB);
  const roundsNeedingSuppStats = await findRoundsNeedingSupplementaryStats(matchRepository, suppRepo);

  // Exclude rounds already handled above
  const allHandled = new Set([
    ...roundsToScrape.map(r => `${r.year}-${r.round}`),
    ...playerStatsOnly.map(r => `${r.year}-${r.round}`),
  ]);
  const suppStatsOnly = roundsNeedingSuppStats.filter(
    r => !allHandled.has(`${r.year}-${r.round}`)
  );

  logger.info('[CRON] Supplementary stats backfill candidates', {
    total: roundsNeedingSuppStats.length,
    backfillCount: suppStatsOnly.length,
    rounds: suppStatsOnly,
  });

  if (suppStatsOnly.length > 0) {
    for (const { year, round } of suppStatsOnly) {
      try {
        logger.info('[CRON] Starting independent supplementary stats scrape', { year, round });
        const suppResult = await scrapeSupplementaryUseCase.execute(year, round);
        logger.info('[CRON] Independent supplementary stats scrape complete', {
          year,
          round,
          playersScraped: suppResult.playersScraped,
          cached: suppResult.cached,
        });
      } catch (suppError) {
        logger.error('[CRON] Independent supplementary stats scrape failed (will retry next cycle)', {
          year,
          round,
          error: suppError instanceof Error ? suppError.message : 'Unknown error',
          stack: suppError instanceof Error ? suppError.stack : undefined,
        });
      }
    }
  }

  // Price/break-even backfill: re-scrape rounds where price or break_even are NULL (migration leftovers)
  const roundsWithNullPriceBE = await suppRepo.findRoundsWithNullPriceBreakEven();

  logger.info('[CRON] Price/break-even backfill candidates', {
    roundsDetected: roundsWithNullPriceBE.length,
    rounds: roundsWithNullPriceBE,
  });

  if (roundsWithNullPriceBE.length > 0) {
    let filled = 0;
    let skipped = 0;
    for (const { year, round } of roundsWithNullPriceBE) {
      try {
        logger.info('[CRON] Starting price/BE backfill scrape', { year, round });
        const backfillResult = await scrapeSupplementaryUseCase.execute(year, round, true);
        logger.info('[CRON] Price/BE backfill scrape complete', {
          year,
          round,
          playersScraped: backfillResult.playersScraped,
        });
        filled++;
      } catch (backfillError) {
        logger.error('[CRON] Price/BE backfill scrape failed (will retry next cycle)', {
          year,
          round,
          error: backfillError instanceof Error ? backfillError.message : 'Unknown error',
        });
        skipped++;
      }
    }
    logger.info('[CRON] Price/BE backfill complete', { filled, skipped, total: roundsWithNullPriceBE.length });
  }

  // Team list scraping: initial Tuesday scrape + window-based updates (24h/90min before match)
  const currentYear = new Date(event.scheduledTime).getFullYear();
  try {
    const teamListUseCase = new ScrapeTeamListsUseCase(
      teamListSource,
      new D1TeamListRepository(env.DB),
      matchRepository
    );

    // Find the current/upcoming round and scrape team lists
    const allMatches = await matchRepository.findByYear(currentYear);
    const upcomingRounds = [...new Set(
      allMatches
        .filter(m => m.status !== 'Completed')
        .map(m => m.round)
    )].sort((a, b) => a - b);

    if (upcomingRounds.length > 0) {
      // Scrape the next upcoming round
      const nextRound = upcomingRounds[0];
      logger.info('[CRON] Starting team list scrape', { year: currentYear, round: nextRound });
      const tlResult = await teamListUseCase.execute(currentYear, nextRound);
      logger.info('[CRON] Team list scrape complete', {
        year: currentYear,
        round: nextRound,
        scraped: tlResult.scrapedCount,
        skipped: tlResult.skippedCount,
        warnings: tlResult.warnings.length,
      });
    }

    // Window-based updates: 24 hours and 90 minutes before kickoff
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const NINETY_MINUTES = 90 * 60 * 1000;

    const windowResult24h = await teamListUseCase.scrapeMatchesInWindow(currentYear, TWENTY_FOUR_HOURS, currentTime);
    if (windowResult24h.scrapedCount > 0) {
      logger.info('[CRON] 24h window team list update', { scraped: windowResult24h.scrapedCount });
    }

    const windowResult90m = await teamListUseCase.scrapeMatchesInWindow(currentYear, NINETY_MINUTES, currentTime);
    if (windowResult90m.scrapedCount > 0) {
      logger.info('[CRON] 90min window team list update', { scraped: windowResult90m.scrapedCount });
    }

    // Backfill completed matches missing team lists
    const backfillResult = await teamListUseCase.backfillCompleted(currentYear);
    if (backfillResult.backfilledCount > 0) {
      logger.info('[CRON] Team list backfill complete', { backfilled: backfillResult.backfilledCount });
    }
  } catch (tlError) {
    logger.error('[CRON] Team list scraping failed (will retry next cycle)', {
      error: tlError instanceof Error ? tlError.message : 'Unknown error',
    });
  }

  // Casualty ward scrape: runs on Tuesday/Wednesday crons to track player injuries
  try {
    const casualtyWardUseCase = new ScrapeCasualtyWardUseCase(
      casualtyWardSource,
      new D1CasualtyWardRepository(env.DB)
    );
    logger.info('[CRON] Starting casualty ward scrape');
    const cwResult = await casualtyWardUseCase.execute();
    logger.info('[CRON] Casualty ward scrape complete', {
      success: cwResult.success,
      newEntries: cwResult.newEntries,
      closedEntries: cwResult.closedEntries,
      updatedEntries: cwResult.updatedEntries,
      totalOpen: cwResult.totalOpen,
      warnings: cwResult.warnings.length,
    });
  } catch (cwError) {
    logger.error('[CRON] Casualty ward scrape failed (will retry next cycle)', {
      error: cwError instanceof Error ? cwError.message : 'Unknown error',
    });
  }

  // Team code backfill: re-scrape rounds where team_code is NULL (migration leftovers)
  const roundsWithNullTeamCode = await suppRepo.findRoundsWithNullTeamCode();

  logger.info('[CRON] Team code backfill candidates', {
    roundsDetected: roundsWithNullTeamCode.length,
    rounds: roundsWithNullTeamCode,
  });

  if (roundsWithNullTeamCode.length > 0) {
    let filled = 0;
    let skipped = 0;
    for (const { year, round } of roundsWithNullTeamCode) {
      try {
        logger.info('[CRON] Starting team code backfill scrape', { year, round });
        const backfillResult = await scrapeSupplementaryUseCase.execute(year, round, true);
        logger.info('[CRON] Team code backfill scrape complete', {
          year,
          round,
          playersScraped: backfillResult.playersScraped,
        });
        filled++;
      } catch (backfillError) {
        logger.error('[CRON] Team code backfill scrape failed (will retry next cycle)', {
          year,
          round,
          error: backfillError instanceof Error ? backfillError.message : 'Unknown error',
        });
        skipped++;
      }
    }
    logger.info('[CRON] Team code backfill complete', { filled, skipped, total: roundsWithNullTeamCode.length });
  }

  logger.info('[CRON] Scheduled handler complete');
};

// Export for Cloudflare Workers — combine Hono fetch handler with scheduled handler
export default {
  fetch: app.fetch,
  scheduled,
};
