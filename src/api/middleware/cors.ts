/**
 * CORS middleware configuration for Hono
 */

import { cors } from 'hono/cors';

/**
 * CORS middleware with permissive settings per FR-005
 */
export const corsMiddleware = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 600,
});
