/**
 * Runs the shared MatchResultsScrapeWatermarkRepository contract suite against
 * the in-memory adapter (feature 040 T008).
 */

import { InMemoryMatchResultsScrapeWatermarkRepository } from '../../../src/infrastructure/persistence/in-memory-match-results-scrape-watermark-repository.js';
import { runMatchResultsScrapeWatermarkRepositoryContractTests } from './match-results-scrape-watermark-repository-contract.js';

runMatchResultsScrapeWatermarkRepositoryContractTests(
  () => new InMemoryMatchResultsScrapeWatermarkRepository(),
);
