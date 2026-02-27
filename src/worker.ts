import { Hono } from 'hono';
import { createApiRoutes } from './api/routes.js';
import { setDebugMode, logger } from './utils/logger.js';
import { cacheStore } from './cache/store.js';

// Environment bindings type
export interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// Initialize logger based on environment
app.use('*', async (c, next) => {
  setDebugMode(c.env?.ENVIRONMENT !== 'production');
  await next();
});

// Mount API routes under /api
app.route('/api', createApiRoutes());

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

// Scheduled handler for cache invalidation (Monday 4pm AEST = 6am UTC)
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  logger.info('Scheduled cache invalidation triggered', {
    timestamp: new Date().toISOString(),
    scheduledTime: new Date(event.scheduledTime).toISOString(),
    cron: event.cron,
  });

  // Invalidate all cached data to trigger fresh scrapes
  cacheStore.invalidateAll();

  logger.info('Cache invalidated by scheduled trigger');
};
