import { Hono } from 'hono';
import { createApiRoutes } from './api/routes.js';
import { setDebugMode, logger } from './utils/logger.js';
import { SuperCoachStatsAdapter } from './infrastructure/adapters/supercoach-stats-adapter.js';
import { NrlComMatchResultAdapter } from './infrastructure/adapters/nrl-com-match-result-adapter.js';
import { D1MatchRepository } from './infrastructure/persistence/d1-match-repository.js';
import { InMemoryMatchRepository } from './database/in-memory-match-repository.js';
import { ScrapeDrawUseCase } from './application/use-cases/scrape-draw.js';
import { ScrapeMatchResultsUseCase } from './application/use-cases/scrape-match-results.js';
import type { MatchResultsScrapeWatermarkRepository } from './domain/repositories/match-results-scrape-watermark-repository.js';
import { KvMatchResultsScrapeWatermarkRepository } from './infrastructure/persistence/kv-match-results-scrape-watermark-repository.js';
import { InMemoryMatchResultsScrapeWatermarkRepository } from './infrastructure/persistence/in-memory-match-results-scrape-watermark-repository.js';
import { D1PlayerRepository } from './infrastructure/persistence/d1-player-repository.js';
import { NrlComPlayerStatsAdapter } from './infrastructure/adapters/nrl-com-player-stats-adapter.js';
import { ScrapePlayerStatsUseCase } from './application/use-cases/scrape-player-stats.js';
import { NrlSupercoachStatsAdapter } from './infrastructure/adapters/nrl-supercoach-stats-adapter.js';
import { D1SupplementaryStatsRepository } from './infrastructure/persistence/d1-supplementary-stats-repo.js';
import { ScrapeSupplementaryStatsUseCase } from './application/use-cases/scrape-supplementary-stats.js';
import { GetSupercoachScoresUseCase } from './application/use-cases/get-supercoach-scores.js';
import { D1PlayerNameLinkRepository } from './infrastructure/persistence/d1-player-name-link-repo.js';
import { loadScoringConfig } from './config/supercoach-scoring-config.js';
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
import { ComputePlayerMovementsUseCase } from './application/use-cases/compute-player-movements.js';
import type { PlayerMovementsRepository } from './domain/repositories/player-movements-repository.js';
import { KvPlayerMovementsRepository } from './infrastructure/persistence/kv-player-movements-repository.js';
import { InMemoryPlayerMovementsRepository } from './infrastructure/persistence/in-memory-player-movements-repository.js';
import { D1GameStrengthRepository } from './infrastructure/persistence/d1-game-strength-repository.js';
import type { GameStrengthRepository } from './domain/repositories/game-strength-repository.js';
import type { ProvisionalGameStrengthRepository } from './domain/repositories/provisional-game-strength-repository.js';
import { KvProvisionalGameStrengthRepository } from './infrastructure/persistence/kv-provisional-game-strength-repository.js';
import { InMemoryProvisionalGameStrengthRepository } from './infrastructure/persistence/in-memory-provisional-game-strength-repository.js';
import { CompositeGameStrengthRepository } from './infrastructure/persistence/composite-game-strength-repository.js';
import { GetGameStrengthUseCase } from './application/use-cases/get-game-strength.js';
import { LockGameStrengthRatingsUseCase } from './application/use-cases/lock-game-strength-ratings.js';
import type { FixtureRepository } from './domain/repositories/fixture-repository.js';
import { KvFixtureRepository } from './infrastructure/persistence/kv-fixture-repository.js';
import { InMemoryFixtureRepository } from './infrastructure/persistence/in-memory-fixture-repository.js';
import { setFixtureRepository } from './database/store.js';
import { buildLegacyFixtureBridge } from './database/legacy-fixture-bridge.js';
import type { HandlerDeps } from './api/handlers.js';
import type { ScrapeJob } from './application/ports/job-queue.js';
import { CloudflareQueueProducer } from './infrastructure/queue/cloudflare-queue-producer.js';
import { InMemoryJobQueue } from './infrastructure/queue/in-memory-job-queue.js';
import { fromCfMessageBatch, type CfMessageBatchLike } from './infrastructure/queue/cloudflare-job-batch.js';
import { EnqueueDueScrapesUseCase } from './application/use-cases/enqueue-due-scrapes.js';
import { HandleScrapeJobUseCase } from './application/use-cases/handle-scrape-job.js';
import type { ProjectionRepository } from './domain/repositories/projection-repository.js';
import { KvProjectionRepository } from './infrastructure/cache/kv-projection-repository.js';
import { InMemoryProjectionRepository } from './infrastructure/cache/in-memory-projection-repository.js';
import { currentWatermark } from './application/services/current-watermark.js';
import { PrecomputePlayerProjectionUseCase } from './application/use-cases/precompute-player-projection.js';
import { PrecomputeTeamRankingsUseCase } from './application/use-cases/precompute-team-rankings.js';
// Spec 037 — four precomputed-artifact repositories for the analytics endpoints
import type { TeamFormRepository } from './domain/repositories/team-form-repository.js';
import { KvTeamFormRepository } from './infrastructure/persistence/kv-team-form-repository.js';
import { InMemoryTeamFormRepository } from './infrastructure/persistence/in-memory-team-form-repository.js';
import type { MatchOutlookRepository } from './domain/repositories/match-outlook-repository.js';
import { KvMatchOutlookRepository } from './infrastructure/persistence/kv-match-outlook-repository.js';
import { InMemoryMatchOutlookRepository } from './infrastructure/persistence/in-memory-match-outlook-repository.js';
import type { PlayerTrendsRepository } from './domain/repositories/player-trends-repository.js';
import { KvPlayerTrendsRepository } from './infrastructure/persistence/kv-player-trends-repository.js';
import { InMemoryPlayerTrendsRepository } from './infrastructure/persistence/in-memory-player-trends-repository.js';
import type { CompositionImpactRepository } from './domain/repositories/composition-impact-repository.js';
import { KvCompositionImpactRepository } from './infrastructure/persistence/kv-composition-impact-repository.js';
import { InMemoryCompositionImpactRepository } from './infrastructure/persistence/in-memory-composition-impact-repository.js';
import { PrecomputeTeamFormUseCase } from './application/use-cases/precompute-team-form.js';
import { PrecomputeMatchOutlookUseCase } from './application/use-cases/precompute-match-outlook.js';
import { PrecomputePlayerTrendsUseCase } from './application/use-cases/precompute-player-trends.js';
import { PrecomputeCompositionImpactUseCase } from './application/use-cases/precompute-composition-impact.js';
// Spec 039 — durable team-strength-rankings repository + use cases
import type { TeamStrengthRankingsRepository } from './domain/repositories/team-strength-rankings-repository.js';
import { KvTeamStrengthRankingsRepository } from './infrastructure/persistence/kv-team-strength-rankings-repository.js';
import { InMemoryTeamStrengthRankingsRepository } from './infrastructure/persistence/in-memory-team-strength-rankings-repository.js';
import { GetTeamStrengthRankingsUseCase } from './application/use-cases/get-team-strength-rankings.js';
import { ComputeTeamStrengthRankingsUseCase } from './application/use-cases/compute-team-strength-rankings.js';

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
const createPlayerRepo = (db: D1Database) => new D1PlayerRepository(db);

// D1-dependent deps — lazily initialized on first request when env.DB is available
let depsInitialized = false;
let legacyStoreHydrated = false;
const deps = {} as HandlerDeps;

function initializeDeps(db?: D1Database, cache?: KVNamespace, scrapeQueue?: Queue<ScrapeJob>): void {
  if (depsInitialized) return;

  // Use D1 when available, fall back to in-memory for environments without D1 (e.g. tests)
  const matchRepository = db ? new D1MatchRepository(db) : new InMemoryMatchRepository();

  // Composition root for the durable fixture artifact (spec 038). One
  // artifact per year, addressed via FixtureRepository.
  const fixtureRepository: FixtureRepository = cache
    ? new KvFixtureRepository(cache)
    : new InMemoryFixtureRepository();
  setFixtureRepository(fixtureRepository);

  // Composition root for the projection store. Swapping this single line to
  // a different concrete adapter (e.g. UpstashProjectionRepository) is the
  // ONLY change required to switch backends — every use case, handler, and
  // test depends on the domain port only (spec 034, FR-013, SC-006).
  const projectionRepository: ProjectionRepository = cache
    ? new KvProjectionRepository(cache)
    : new InMemoryProjectionRepository();

  // Composition root for the player-movements artifact store (spec 035).
  // Same selection rule as projectionRepository above.
  const playerMovementsRepository: PlayerMovementsRepository = cache
    ? new KvPlayerMovementsRepository(cache)
    : new InMemoryPlayerMovementsRepository();

  // Composition root for the provisional game-strength-rating sub-adapter
  // (spec 036). KV in production, in-memory otherwise; see
  // tests/integration/no-cache-binding-fallback.test.ts. This is internal —
  // application-layer callers see only the unified `GameStrengthRepository`
  // port via the composite below.
  const provisionalGsrSubAdapter: ProvisionalGameStrengthRepository = cache
    ? new KvProvisionalGameStrengthRepository(cache)
    : new InMemoryProvisionalGameStrengthRepository();

  // Spec 037 — composition roots for the four analytics precomputed-artifact
  // repositories. Same KV/in-memory selection rule as above.
  const teamFormRepository: TeamFormRepository = cache
    ? new KvTeamFormRepository(cache)
    : new InMemoryTeamFormRepository();
  const matchOutlookRepository: MatchOutlookRepository = cache
    ? new KvMatchOutlookRepository(cache)
    : new InMemoryMatchOutlookRepository();
  const playerTrendsRepository: PlayerTrendsRepository = cache
    ? new KvPlayerTrendsRepository(cache)
    : new InMemoryPlayerTrendsRepository();
  const compositionImpactRepository: CompositionImpactRepository = cache
    ? new KvCompositionImpactRepository(cache)
    : new InMemoryCompositionImpactRepository();

  // Spec 039 — durable team-strength-rankings repository (ninth precomputed-
  // artifact store). KV in production, in-memory otherwise.
  const teamStrengthRankingsRepository: TeamStrengthRankingsRepository = cache
    ? new KvTeamStrengthRankingsRepository(cache)
    : new InMemoryTeamStrengthRankingsRepository();

  // Spec 040 — durable cross-isolate watermark for the match-results scrape.
  // KV in production, in-memory otherwise (local dev / tests).
  const matchResultsScrapeWatermarkRepository: MatchResultsScrapeWatermarkRepository = cache
    ? new KvMatchResultsScrapeWatermarkRepository(cache)
    : new InMemoryMatchResultsScrapeWatermarkRepository();

  // Per-request D1 binding constructions still happen in the factories
  // below; the composite is built per-request inside those factories so
  // each request gets a D1 sub-adapter scoped to its own binding (the
  // provisional sub-adapter is module-level and shared).
  const buildGameStrengthRepository = (reqDb: D1Database): GameStrengthRepository =>
    new CompositeGameStrengthRepository(
      new D1GameStrengthRepository(reqDb),
      provisionalGsrSubAdapter,
    );

  Object.assign(deps, {
    projectionRepository,
    gameStrengthRepository: buildGameStrengthRepository,
    scrapeDrawUseCase: new ScrapeDrawUseCase(fixtureRepository, dataSource, matchRepository),
    fixtureRepository,
    jobProducer: scrapeQueue
      ? new CloudflareQueueProducer(scrapeQueue)
      : new InMemoryJobQueue(),
    scrapeMatchResultsUseCase: new ScrapeMatchResultsUseCase(matchResultSource, matchRepository, matchResultsScrapeWatermarkRepository),
    matchRepository,
    createPlayerRepository: createPlayerRepo,
    createScrapePlayerStatsUseCase: (reqDb: D1Database) =>
      new ScrapePlayerStatsUseCase(playerStatsSource, new D1PlayerRepository(reqDb), new D1SupplementaryStatsRepository(reqDb)),
    getTeamFormUseCase: new GetTeamFormUseCase(matchRepository, fixtureRepository, teamFormRepository),
    getMatchOutlookUseCase: new GetMatchOutlookUseCase(matchRepository, fixtureRepository, matchOutlookRepository),
    getPlayerTrendsUseCase: new GetPlayerTrendsUseCase(createPlayerRepo, playerTrendsRepository),
    getCompositionImpactUseCase: new GetCompositionImpactUseCase(matchRepository, createPlayerRepo, compositionImpactRepository),
    teamFormRepository,
    matchOutlookRepository,
    playerTrendsRepository,
    compositionImpactRepository,
    watermarkFn: (reqDb: D1Database, year: number) => {
      const playerRepo = new D1PlayerRepository(reqDb);
      const suppRepo = new D1SupplementaryStatsRepository(reqDb);
      return currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
    },
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
        playerRepo, scUseCase, innerPlayerProj, matchRepository, projectionRepository, watermarkFn,
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
      return new GetContextualProjectionUseCase(playerRepo, scUseCase, projectionUseCase, matchRepository, projectionRepository, watermarkFn);
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
      return new GetContextualProfileUseCase(playerRepo, scUseCase, projectionUseCase, matchRepository, projectionRepository, watermarkFn);
    },
    playerMovementsRepository,
    createComputePlayerMovementsUseCase: (reqDb: D1Database) =>
      new ComputePlayerMovementsUseCase(
        new D1TeamListRepository(reqDb),
        matchRepository,
        new D1CasualtyWardRepository(reqDb),
        playerMovementsRepository
      ),
    createGetGameStrengthUseCase: (reqDb: D1Database) => {
      const scUseCase = new GetSupercoachScoresUseCase(
        new D1PlayerRepository(reqDb),
        new D1SupplementaryStatsRepository(reqDb),
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      return new GetGameStrengthUseCase(scUseCase, fixtureRepository, buildGameStrengthRepository(reqDb));
    },
    createLockGameStrengthUseCase: (reqDb: D1Database) => {
      const scUseCase = new GetSupercoachScoresUseCase(
        new D1PlayerRepository(reqDb),
        new D1SupplementaryStatsRepository(reqDb),
        loadScoringConfig(new Date().getFullYear()),
        new D1PlayerNameLinkRepository(reqDb),
        matchRepository
      );
      return new LockGameStrengthRatingsUseCase(scUseCase, fixtureRepository, buildGameStrengthRepository(reqDb));
    },
    createGetTeamStrengthRankingsUseCase: (reqDb: D1Database) => {
      const playerRepo = new D1PlayerRepository(reqDb);
      const suppRepo = new D1SupplementaryStatsRepository(reqDb);
      const watermarkFn = (year: number) =>
        currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
      return new GetTeamStrengthRankingsUseCase({
        repository: teamStrengthRankingsRepository,
        watermarkFn,
      });
    },
    teamStrengthRankingsRepository,
  } satisfies HandlerDeps);

  depsInitialized = true;
}

/** Hydrate the durable fixture artifact from D1 on cold start when the
 *  repository has no artifact for a year that D1 already knows about.
 *  Production runs against KV where the artifact persists, so this only
 *  fires on a fresh KV namespace or local in-memory fallback. */
async function hydrateLegacyStore(): Promise<void> {
  if (legacyStoreHydrated) return;
  legacyStoreHydrated = true;

  try {
    const years = await deps.matchRepository.getLoadedYears();
    const scrapedYears = await deps.fixtureRepository.listScrapedYears();
    for (const year of years) {
      if (scrapedYears.has(year)) continue;
      const matches = await deps.matchRepository.findByYear(year);
      await buildLegacyFixtureBridge(deps.fixtureRepository, year, matches);
    }
    if (years.length > 0) {
      logger.info('Fixture artifact hydrated from D1', { years });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to hydrate fixture artifact', { error: message });
  }
}

const app = new Hono<{ Bindings: Env }>();

// Initialize logger and D1-dependent deps on first request
app.use('*', async (c, next) => {
  setDebugMode(c.env?.ENVIRONMENT !== 'production');
  initializeDeps(c.env?.DB, c.env?.CACHE, c.env?.SCRAPE_QUEUE);
  await hydrateLegacyStore();
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

  // Ensure deps are initialized for scheduled handler
  logger.info('[CRON] Initializing deps', { depsAlreadyInitialized: depsInitialized });
  initializeDeps(env.DB, env.CACHE, env.SCRAPE_QUEUE);
  const matchRepository = deps.matchRepository;

  // Log loaded years to verify D1 connectivity
  const loadedYears = await matchRepository.getLoadedYears();
  const matchCount = await matchRepository.getMatchCount();
  logger.info('[CRON] D1 state', { loadedYears, matchCount });

  try {
    const playerRepo = new D1PlayerRepository(env.DB);
    const teamListRepo = new D1TeamListRepository(env.DB);
    const suppRepo = new D1SupplementaryStatsRepository(env.DB);
    const producer = new CloudflareQueueProducer(env.SCRAPE_QUEUE);
    const watermarkFn = (year: number) =>
      currentWatermark(year, { matchRepository, playerRepository: playerRepo, supplementaryRepo: suppRepo });
    const enqueueUseCase = new EnqueueDueScrapesUseCase({
      matchRepository,
      playerRepository: playerRepo,
      supplementaryRepo: suppRepo,
      teamListRepository: teamListRepo,
      gameStrengthRepository: deps.gameStrengthRepository(env.DB),
      matchResultSource,
      playerStatsSource,
      supplementaryStatsSource,
      teamListSource,
      casualtyWardSource,
      producer,
      projectionRepository: deps.projectionRepository,
      watermarkFn,
      playerMovementsRepository: deps.playerMovementsRepository,
      teamFormRepository: deps.teamFormRepository,
      matchOutlookRepository: deps.matchOutlookRepository,
      playerTrendsRepository: deps.playerTrendsRepository,
      compositionImpactRepository: deps.compositionImpactRepository,
      teamStrengthRankingsRepository: deps.teamStrengthRankingsRepository,
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
  initializeDeps(env.DB, env.CACHE, env.SCRAPE_QUEUE);

  // Per-request scrape use cases — each holds a D1 binding so they're built
  // here rather than at module load time.
  const playerRepo = new D1PlayerRepository(env.DB);
  const suppRepo = new D1SupplementaryStatsRepository(env.DB);
  const teamListRepo = new D1TeamListRepository(env.DB);
  const casualtyRepo = new D1CasualtyWardRepository(env.DB);
  const scrapePlayerStatsUC = new ScrapePlayerStatsUseCase(playerStatsSource, playerRepo, suppRepo);
  const queueProducer = new CloudflareQueueProducer(env.SCRAPE_QUEUE);
  const scrapeSuppUC = new ScrapeSupplementaryStatsUseCase(supplementaryStatsSource, suppRepo, queueProducer);
  const scrapeTeamListsUC = new ScrapeTeamListsUseCase(
    teamListSource,
    teamListRepo,
    deps.matchRepository,
    queueProducer,
  );
  const scrapeCasualtyUC = new ScrapeCasualtyWardUseCase(casualtyWardSource, casualtyRepo, playerRepo);
  const computeMovementsUC = new ComputePlayerMovementsUseCase(
    teamListRepo,
    deps.matchRepository,
    casualtyRepo,
    deps.playerMovementsRepository
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

  // Spec 037: per-(year,identity) precompute leaf jobs for the four
  // AnalyticsCache-replacing repositories. Each is independent of US-2's
  // projection precompute pipeline; they read from the same match/player
  // D1 bindings but write to their own KV / in-memory backed repositories.
  const precomputeTeamFormUC = new PrecomputeTeamFormUseCase(
    deps.matchRepository, deps.fixtureRepository, deps.teamFormRepository,
  );
  const precomputeMatchOutlookUC = new PrecomputeMatchOutlookUseCase(
    deps.matchRepository, deps.fixtureRepository, deps.matchOutlookRepository,
  );
  const precomputePlayerTrendsUC = new PrecomputePlayerTrendsUseCase(
    playerRepo, deps.playerTrendsRepository,
  );
  const precomputeCompositionImpactUC = new PrecomputeCompositionImpactUseCase(
    deps.matchRepository, playerRepo, deps.compositionImpactRepository,
  );

  // Spec 039 — batched team-strength-rankings precompute. Reuses the
  // process-level repository (KV in prod, in-memory in tests).
  const computeTeamStrengthRankingsUC = new ComputeTeamStrengthRankingsUseCase({
    fixtureRepository: deps.fixtureRepository,
    teamStrengthRankingsRepository: deps.teamStrengthRankingsRepository,
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
    precomputeTeamForm: precomputeTeamFormUC,
    precomputeMatchOutlook: precomputeMatchOutlookUC,
    precomputePlayerTrends: precomputePlayerTrendsUC,
    precomputeCompositionImpact: precomputeCompositionImpactUC,
    scrapeDraw: deps.scrapeDrawUseCase,
    computeTeamStrengthRankings: computeTeamStrengthRankingsUC,
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
