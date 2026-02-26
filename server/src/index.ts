/**
 * Server entry point
 */

import { createApp } from './api/index.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 3001;

const app = createApp();

app.listen(PORT, () => {
  logger.info('Server started', { port: PORT });
  console.log(`🚀 NRL Schedule Scraper API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
