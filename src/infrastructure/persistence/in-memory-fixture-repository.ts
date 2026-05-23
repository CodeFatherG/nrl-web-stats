/**
 * InMemoryFixtureRepository — process-local fallback adapter for
 * FixtureRepository.
 *
 * Used when no KV binding is configured (local dev, unit tests). Contents
 * do not survive isolate recycling (FR-020).
 *
 * Feature: 038-kv-fixture-repository (T007).
 */

import type { Fixture } from '../../models/fixture.js';
import type {
  FixtureArtifact,
  FixtureRepository,
} from '../../domain/repositories/fixture-repository.js';
import { projectToPublic } from './fixture-envelope.js';

export class InMemoryFixtureRepository implements FixtureRepository {
  private readonly entries = new Map<number, FixtureArtifact>();

  async findByYear(year: number): Promise<FixtureArtifact | null> {
    return this.entries.get(year) ?? null;
  }

  async findByYearAndTeam(
    year: number,
    teamCode: string,
  ): Promise<FixtureArtifact | null> {
    const artifact = this.entries.get(year);
    return artifact ? projectToPublic(artifact, teamCode) : null;
  }

  async listScrapedYears(): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    for (const [year, artifact] of this.entries) {
      result.set(year, artifact.freshness.lastScrapedAt);
    }
    return result;
  }

  async save(year: number, fixtures: readonly Fixture[]): Promise<void> {
    const now = new Date().toISOString();
    this.entries.set(year, {
      year,
      computedAt: now,
      freshness: { lastScrapedAt: now },
      payload: [...fixtures],
    });
  }
}
