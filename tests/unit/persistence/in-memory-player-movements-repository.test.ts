import { InMemoryPlayerMovementsRepository } from '../../../src/infrastructure/persistence/in-memory-player-movements-repository.js';
import { runPlayerMovementsRepositoryContractTests } from './player-movements-repository-contract.js';

runPlayerMovementsRepositoryContractTests(
  'InMemoryPlayerMovementsRepository',
  () => new InMemoryPlayerMovementsRepository(),
);
