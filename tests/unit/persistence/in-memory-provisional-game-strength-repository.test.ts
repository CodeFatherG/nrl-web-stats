import { InMemoryProvisionalGameStrengthRepository } from '../../../src/infrastructure/persistence/in-memory-provisional-game-strength-repository.js';
import { runProvisionalGameStrengthRepositoryContractTests } from './provisional-game-strength-repository-contract.js';

runProvisionalGameStrengthRepositoryContractTests(
  'InMemoryProvisionalGameStrengthRepository',
  () => new InMemoryProvisionalGameStrengthRepository(),
);
