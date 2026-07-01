/**
 * KvFixtureRepository — Cloudflare Workers KV adapter for FixtureRepository.
 *
 * All KV-specific concerns (key derivation, envelope encoding, quota
 * detection) live here. Callers depend only on the domain port.
 *
 * Feature: 038-kv-fixture-repository (T006).
 */

import type { Fixture } from '../../models/fixture.js';
import {
  FixtureStoreQuotaExhaustedError,
  type FixtureArtifact,
  type FixtureRepository,
} from '../../domain/repositories/fixture-repository.js';
import {
  decodeArtifact,
  encodeArtifact,
  projectToPublic,
} from './fixture-envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

const KEY_PREFIX = 'fixtures:v1:';

function artifactKey(year: number): string {
  return `${KEY_PREFIX}${year}`;
}

function parseYearFromKey(key: string): number | null {
  const suffix = key.slice(KEY_PREFIX.length);
  if (suffix.length === 0) return null;
  const n = Number(suffix);
  return Number.isInteger(n) ? n : null;
}

interface FixtureCoverageMetadata {
  readonly lastScrapedAt: string;
}

export class KvFixtureRepository implements FixtureRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findByYear(year: number): Promise<FixtureArtifact | null> {
    const raw = await this.kv.get(artifactKey(year));
    return decodeArtifact(year, raw);
  }

  async findByYearAndTeam(
    year: number,
    teamCode: string,
  ): Promise<FixtureArtifact | null> {
    const artifact = await this.findByYear(year);
    return artifact ? projectToPublic(artifact, teamCode) : null;
  }

  async listScrapedYears(): Promise<Map<number, string>> {
    const entries = await pagedKvList<FixtureCoverageMetadata, [number, string]>({
      kv: this.kv,
      prefix: KEY_PREFIX,
      transform: (key, metadata) => {
        const year = parseYearFromKey(key);
        if (year === null) return null;
        if (!metadata || typeof metadata.lastScrapedAt !== 'string') return null;
        return [year, metadata.lastScrapedAt];
      },
    });
    return new Map(entries);
  }

  async save(year: number, fixtures: readonly Fixture[]): Promise<void> {
    const key = artifactKey(year);
    const { value, metadata } = encodeArtifact(year, fixtures);
    await wrapKvErrors({
      op: () => this.kv.put(key, value, { metadata }),
      wrapQuotaAs: cause =>
        new FixtureStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
