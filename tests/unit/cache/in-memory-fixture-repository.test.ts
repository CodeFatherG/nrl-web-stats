/**
 * Unit test for InMemoryFixtureRepository — runs the shared contract suite
 * against the in-memory adapter.
 *
 * Feature: 038-kv-fixture-repository (T010).
 */

import { InMemoryFixtureRepository } from '../../../src/infrastructure/persistence/in-memory-fixture-repository.js';
import { runFixtureRepositoryContract } from './fixture-repository-contract.js';

runFixtureRepositoryContract(() => new InMemoryFixtureRepository());
