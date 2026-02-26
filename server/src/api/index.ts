/**
 * Express app setup with CORS middleware and static file serving
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './routes.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // CORS configuration for React dev servers
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
  }));

  // JSON body parser
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('Request received', {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });

  // API routes
  app.use('/api', router);

  // Serve static files from public directory (production build)
  const publicPath = path.join(__dirname, '..', '..', 'public');
  app.use(express.static(publicPath));

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip if this is an API route (should have been handled above)
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err) {
        // If index.html doesn't exist, fall through to 404 handler
        next();
      }
    });
  });

  // 404 handler (for API routes or when static files don't exist)
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Endpoint not found',
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Request error', {
      error: err.message,
      stack: err.stack,
    });

    if (err instanceof AppError) {
      res.status(err.statusCode).json(err.toJSON());
    } else {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  });

  return app;
}
