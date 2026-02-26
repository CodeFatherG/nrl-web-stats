/**
 * Express app setup with CORS middleware
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

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

  // 404 handler
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
