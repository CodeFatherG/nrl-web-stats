/**
 * T009 — Run the shared contract suite against InMemoryProjectionRepository.
 * Feature: 034-precomputed-projections.
 */

import { InMemoryProjectionRepository } from '../../../src/infrastructure/cache/in-memory-projection-repository.js';
import { runProjectionRepositoryContractTests } from './projection-repository-contract.js';

runProjectionRepositoryContractTests(() => new InMemoryProjectionRepository());
