import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Environment bindings type
interface Env {
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware for API routes
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 600,
}));

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    loadedYears: [],
    totalFixtures: 0,
  });
});

// API routes placeholder - will be expanded in Phase 2
app.get('/api/teams', (c) => {
  return c.json([]);
});

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
export const scheduled: ExportedHandlerScheduledHandler = async (event, env, ctx) => {
  console.log('Scheduled cache invalidation triggered at', new Date().toISOString());
  // TODO: Implement cache invalidation in Phase 5
};
