/**
 * Runs the shared TeamStrengthRankingsRepository contract suite against the
 * in-memory adapter (feature 039 T008).
 */

import { InMemoryTeamStrengthRankingsRepository } from '../../../src/infrastructure/persistence/in-memory-team-strength-rankings-repository.js';
import { runTeamStrengthRankingsRepositoryContractTests } from './team-strength-rankings-repository-contract.js';

runTeamStrengthRankingsRepositoryContractTests(
  () => new InMemoryTeamStrengthRankingsRepository(),
);
