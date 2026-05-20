import { Hono } from 'hono';
import { createApiRoutes } from './api/routes.js';
import { setDebugMode, logger } from './utils/logger.js';
import { cacheStore, getNextMondayExpiry } from './cache/store.js';
import { SuperCoachStatsAdapter } from './infrastructure/adapters/supercoach-stats-adapter.js';
import { NrlComMatchResultAdapter } from './infrastructure/adapters/nrl-com-match-result-adapter.js';
import { D1MatchRepository } from './infrastructure/persistence/d1-match-repository.js';
import { InMemoryMatchRepository } from './database/in-memory-match-repository.js';
import { ScrapeDrawUseCase } from './application/use-cases/scrape-draw.js';
import { ScrapeMatchResultsUseCase } from './application/use-cases/scrape-match-results.js';
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
import { GetPlayerProjectionUseCase } from './application/use-cases/get-player-projection.js';
import { GetTeamProjectionRankingsUseCase } from './application/use-cases/get-team-projection-rankings.js';
import { GetContextualProjectionUseCase } from './application/use-cases/get-contextual-projection.js';
import { GetContextualProfileUseCase } from './application/use-cases/get-contextual-profile.js';
import { playerMovementsCache } from './analytics/player-movements-cache.js';
import { ComputePlayerMovementsUseCase } from './application/use-cases/compute-player-movements.js';
import { gameStrengthCache } from './analytics/game-strength-cache.js';
import { D1GameStrengthRepository } from './infrastructure/persistence/d1-game-strength-repository.js';
import { GetGameStrengthUseCase } from './application/use-cases/get-game-strength.js';
import { LockGameStrengthRatingsUseCase } from './application/use-cases/lock-game-strength-ratings.js';
import { fixtureRepositoryAdapter } from './application/adapters/fixture-repository-adapter.js';
import { buildLegacyFixtureBridge } from './database/legacy-fixture-bridge.js';
import type { HandlerDeps } from './api/handlers.js';
import type { ScrapeJob } from './application/ports/job-queue.js';
import { CloudflareQueueProducer } from './infrastructure/queue/cloudflare-queue-producer.js';
import { fromCfMessageBatch, type CfMessageBatchLike } from './infrastructure/queue/cloudflare-job-batch.js';
import { EnqueueDueScrapesUseCase } from './application/use-cases/enqueue-due-scrapes.js';
import { HandleScrapeJobUseCase } from './application/use-cases/handle-scrape-job.js';
import type { ProjectionRepository } from './domain/repositories/projection-repository.js';
import { KvProjectionRepository } from './infrastructure/cache/kv-projection-repository.js';
import { InMemoryProjectionRepository } from './infrastructure/cache/in-memory-projection-repository.js';
import { currentWatermark } from './application/services/current-watermark.js';
import { PrecomputePlayerProjectionUseCase } from './application/use-cases/precompute-player-projection.js';
import { PrecomputeTeamRankingsUseCase } from './application/use-cases/precompute-team-rankings.js';

// Environment bindings type
export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  DB: D1Database;
  SCRAPE_QUEUE: Queue<ScrapeJob>;
  /** Cloudflare KV — precomputed projection artifacts (spec 034). Optional in
   *  local/dev: when absent the worker falls back to InMemoryProjectionRepository. */
  CACHE?: KVNamespace;
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

function initializeDeps(db?: D1Database, cache?: KVNamespace): void {
  if (depsInitialized) return;

  // Use D1 when available, fall back to in-memory for environments without D1 (e.g. tests)
  const matchRepository = db ? new D1MatchRepository(db) : new InMemoryMatchRepository();

  // Composition root for the projection store. Swapping this single line to
  // a different concrete adapter (e.g. UpstashProjectionRepository) is the
  // ONLY change required to switch backends — every use case, handler, and
  // test depends on the domain port only (spec 034, FR-013, SC-006).
  const projectionRepository: ProjectionRepository = cache
    ? new KvProjectionRepository(cache)
    : new InMemoryProjectionRepository();

  Object.assign(deps, {
    projectionRepository,
    scrapeDrawUseCase: new ScrapeDrawUseCase(cacheServiceAdapter, dataSource, matchRepository),
    scrapeMatchResultsUseCase: new ScrapeMatchResultsUseCase(matchResultSource, matchRepository, resultCacheStore),
    matchRepository,
    createPlayerRepository: createPlayerRepo,
    createScrapePlayerStatsUseCase: (reqDb: D1Database) =>
      new ScrapePlayerStatsUseCase(playerStatsSource, new D1PlayerRepository(reqDb), new D1SupplementaryStatsRepository(reqDb)),
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
      new ScrapeCasualtyWardUseCase(casualtyWardSource, new D1CasualtyWardRepository(reqDb), new D1PlayerRepository(reqDb)),
    createCasualtyWardRepository: (reqDb: D1Database) => new D1CasualtyWardRepository(reqDb),
    createGetPlayerProjectionUseCase: (reqDb: D1Database) => {
      const playerRepo = new D1PlayerRepository(reqDb);
      const suppRepo = new D1SupplementaryStatsRepository(reqDb);
      const scUseCase = new GetSupercoachScoresUseCase(
        playerRepo,
        suppRepo,
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      const watermarkFn = (year: number) =>
        currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
      // SPEC-034-READTHROUGH — /projection populates the FULL aggregate on
      // miss by also computing contextualProfile. To avoid infinite recursion
      // (contextualProfile internally calls projectionUseCase.execute → which
      // is THIS use case), we build a NO-read-through inner /projection for
      // contextualProfile to use, and a WITH-read-through outer /projection
      // for the route handler.
      const innerPlayerProj = new GetPlayerProjectionUseCase(playerRepo, scUseCase, projectionRepository, watermarkFn);
      const contextualProfileForReadThrough = new GetContextualProfileUseCase(
        playerRepo, scUseCase, innerPlayerProj, matchRepository, analyticsCache, projectionRepository, watermarkFn,
      );
      return new GetPlayerProjectionUseCase(
        playerRepo, scUseCase, projectionRepository, watermarkFn,
        contextualProfileForReadThrough,
      );
    },
    createGetTeamProjectionRankingsUseCase: (reqDb: D1Database) => {
      const playerRepo = new D1PlayerRepository(reqDb);
      const suppRepo = new D1SupplementaryStatsRepository(reqDb);
      const scUseCase = new GetSupercoachScoresUseCase(
        playerRepo,
        suppRepo,
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      const watermarkFn = (year: number) =>
        currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
      return new GetTeamProjectionRankingsUseCase(playerRepo, scUseCase, projectionRepository, watermarkFn);
    },
    createSupplementaryStatsRepository: (reqDb: D1Database) => new D1SupplementaryStatsRepository(reqDb),
    createGetContextualProjectionUseCase: (reqDb: D1Database) => {
      const playerRepo = new D1PlayerRepository(reqDb);
      const suppRepo = new D1SupplementaryStatsRepository(reqDb);
      const scUseCase = new GetSupercoachScoresUseCase(
        playerRepo,
        suppRepo,
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      const watermarkFn = (year: number) =>
        currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
      const projectionUseCase = new GetPlayerProjectionUseCase(playerRepo, scUseCase, projectionRepository, watermarkFn);
      return new GetContextualProjectionUseCase(playerRepo, scUseCase, projectionUseCase, matchRepository, analyticsCache, projectionRepository, watermarkFn);
    },
    createGetContextualProfileUseCase: (reqDb: D1Database) => {
      const playerRepo = new D1PlayerRepository(reqDb);
      const suppRepo = new D1SupplementaryStatsRepository(reqDb);
      const scUseCase = new GetSupercoachScoresUseCase(
        playerRepo,
        suppRepo,
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      const watermarkFn = (year: number) =>
        currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
      const projectionUseCase = new GetPlayerProjectionUseCase(playerRepo, scUseCase, projectionRepository, watermarkFn);
      return new GetContextualProfileUseCase(playerRepo, scUseCase, projectionUseCase, matchRepository, analyticsCache, projectionRepository, watermarkFn);
    },
    playerMovementsCache,
    createComputePlayerMovementsUseCase: (reqDb: D1Database) =>
      new ComputePlayerMovementsUseCase(
        new D1TeamListRepository(reqDb),
        matchRepository,
        new D1CasualtyWardRepository(reqDb),
        playerMovementsCache
      ),
    createGetGameStrengthUseCase: (reqDb: D1Database) => {
      const scUseCase = new GetSupercoachScoresUseCase(
        new D1PlayerRepository(reqDb),
        new D1SupplementaryStatsRepository(reqDb),
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      return new GetGameStrengthUseCase(scUseCase, fixtureRepositoryAdapter, new D1GameStrengthRepository(reqDb), gameStrengthCache);
    },
    createLockGameStrengthUseCase: (reqDb: D1Database) => {
      const scUseCase = new GetSupercoachScoresUseCase(
        new D1PlayerRepository(reqDb),
        new D1SupplementaryStatsRepository(reqDb),
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      return new LockGameStrengthRatingsUseCase(scUseCase, fixtureRepositoryAdapter, new D1GameStrengthRepository(reqDb), gameStrengthCache);
    },
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
  initializeDeps(c.env?.DB, c.env?.CACHE);
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
      // Strip query params for asset lookup — static files don't use them,
      // and passing them can cause non-404 errors that would bypass the SPA fallback
      const assetRequest = new Request(new URL(url.pathname, url.origin).toString());
      const response = await c.env.ASSETS.fetch(assetRequest);
      if (response.ok) {
        return response;
      }
    } catch {
      // Fall through to index.html
    }
    // SPA fallback - serve index.html for client-side routing
    try {
      const indexRequest = new Request(new URL('/index.html', url.origin).toString());
      return await c.env.ASSETS.fetch(indexRequest);
    } catch (err) {
      logger.error('Failed to serve index.html', { error: String(err) });
      return c.text('Failed to serve application', 500);
    }
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
  initializeDeps(env.DB, env.CACHE);
  const matchRepository = deps.matchRepository;

  // Log loaded years to verify D1 connectivity
  const loadedYears = await matchRepository.getLoadedYears();
  const matchCount = await matchRepository.getMatchCount();
  logger.info('[CRON] D1 state', { loadedYears, matchCount });

  try {
    const playerRepo = new D1PlayerRepository(env.DB);
    const teamListRepo = new D1TeamListRepository(env.DB);
    const gsrRepo = new D1GameStrengthRepository(env.DB);
    const suppRepo = new D1SupplementaryStatsRepository(env.DB);
    const producer = new CloudflareQueueProducer(env.SCRAPE_QUEUE);
    const watermarkFn = (year: number) =>
      currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
    const enqueueUseCase = new EnqueueDueScrapesUseCase({
      matchRepository,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
      gameStrengthRepo: gsrRepo,
      matchResultSource,
      playerStatsSource,
      supplementaryStatsSource,
      teamListSource,
      casualtyWardSource,
      producer,
      projectionRepository: deps.projectionRepository,
      watermarkFn,
    });
    await enqueueUseCase.execute({
      scheduledTime: new Date(event.scheduledTime),
      currentYear: new Date(event.scheduledTime).getFullYear(),
      shadowMode: false,
    });
  } catch (discoveryError) {
    logger.error('[CRON] Discovery failed — no jobs published this tick', {
      error: discoveryError instanceof Error ? discoveryError.message : 'Unknown error',
      stack: discoveryError instanceof Error ? discoveryError.stack : undefined,
    });
  }

  logger.info('[CRON] Scheduled handler complete');
};

const queue: ExportedHandlerQueueHandler<Env, ScrapeJob> = async (batch, env) => {
  setDebugMode(env.ENVIRONMENT !== 'production');
  initializeDeps(env.DB, env.CACHE);

  // Per-request scrape use cases — each holds a D1 binding so they're built
  // here rather than at module load time.
  const playerRepo = new D1PlayerRepository(env.DB);
  const suppRepo = new D1SupplementaryStatsRepository(env.DB);
  const teamListRepo = new D1TeamListRepository(env.DB);
  const casualtyRepo = new D1CasualtyWardRepository(env.DB);
  const scrapePlayerStatsUC = new ScrapePlayerStatsUseCase(playerStatsSource, playerRepo, suppRepo);
  const scrapeSuppUC = new ScrapeSupplementaryStatsUseCase(supplementaryStatsSource, suppRepo);
  const scrapeTeamListsUC = new ScrapeTeamListsUseCase(teamListSource, teamListRepo, deps.matchRepository);
  const scrapeCasualtyUC = new ScrapeCasualtyWardUseCase(casualtyWardSource, casualtyRepo, playerRepo);
  const computeMovementsUC = new ComputePlayerMovementsUseCase(
    teamListRepo,
    deps.matchRepository,
    casualtyRepo,
    playerMovementsCache
  );
  const lockGsrUC = deps.createLockGameStrengthUseCase(env.DB);

  // Spec 034: per-leaf precompute use cases (fan-out). We use deps' repo-wrapped
  // read-side use cases here because they expose computeLive() — the precompute
  // calls that method directly and therefore never recurses through the
  // repo-first read path.
  const playerProjectionUC = deps.createGetPlayerProjectionUseCase(env.DB);
  const teamRankingsUC = deps.createGetTeamProjectionRankingsUseCase(env.DB);
  const contextualProfileUC = deps.createGetContextualProfileUseCase(env.DB);
  const precomputePlayerProjectionUC = new PrecomputePlayerProjectionUseCase({
    projectionRepository: deps.projectionRepository,
    playerProjectionLive: playerProjectionUC,
    contextualProfileLive: contextualProfileUC,
  });
  const precomputeTeamRankingsUC = new PrecomputeTeamRankingsUseCase({
    projectionRepository: deps.projectionRepository,
    teamRankingsLive: teamRankingsUC,
  });

  const dispatcher = new HandleScrapeJobUseCase({
    scrapeMatchResults: deps.scrapeMatchResultsUseCase,
    scrapePlayerStats: scrapePlayerStatsUC,
    scrapeSupplementaryStats: scrapeSuppUC,
    scrapeTeamLists: scrapeTeamListsUC,
    scrapeCasualtyWard: scrapeCasualtyUC,
    computePlayerMovements: computeMovementsUC,
    lockGameStrength: lockGsrUC,
    precomputePlayerProjection: precomputePlayerProjectionUC,
    precomputeTeamRankings: precomputeTeamRankingsUC,
  });

  const jobBatch = fromCfMessageBatch(batch as unknown as CfMessageBatchLike<unknown>);
  await dispatcher.handle(jobBatch);
};

// Export for Cloudflare Workers — combine Hono fetch handler with scheduled and queue handlers
export default {
  fetch: app.fetch,
  scheduled,
  queue,
};
