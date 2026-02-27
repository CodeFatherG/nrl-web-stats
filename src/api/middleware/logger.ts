/**
 * Structured logging middleware for Hono
 */

import type { MiddlewareHandler } from 'hono';
import { logger as appLogger } from '../../utils/logger.js';

/**
 * Request/response logging middleware
 * Logs all requests with timing information
 */
export const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  appLogger.info('Request received', { method, path });

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  appLogger.info('Response sent', {
    method,
    path,
    status,
    durationMs: duration,
  });
};

/**
 * Error logging middleware
 * Should be added early in the middleware chain
 */
export const errorLoggerMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;

    appLogger.error('Unhandled error', {
      method: c.req.method,
      path: c.req.path,
      error: message,
      stack,
    });

    throw error;
  }
};
