/**
 * Express route definitions
 */

import { Router } from 'express';
import * as handlers from './handlers.js';

export const router = Router();

// Health check
router.get('/health', handlers.healthCheck);

// Scrape endpoint
router.post('/scrape', handlers.scrapeSchedule);

// Years endpoint
router.get('/years', handlers.getYears);

// Teams endpoints
router.get('/teams', handlers.getTeams);
router.get('/teams/:code/schedule', handlers.getTeamSchedule);

// Fixtures endpoint
router.get('/fixtures', handlers.getFixtures);

// Rounds endpoint
router.get('/rounds/:year/:round', handlers.getRoundDetails);
