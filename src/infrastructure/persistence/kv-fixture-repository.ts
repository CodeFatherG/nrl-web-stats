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

/** Match KV's daily-write-limit-exceeded response. Conservative: requires
 *  both a 429 signal and a quota/daily-limit/rate-limit phrase. False
 *  classification only triggers terminal-instead-of-retry (safer direction). */
function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
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
    const result = new Map<number, string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<{ lastScrapedAt: string }>({
        prefix: KEY_PREFIX,
        cursor,
      });
      for (const entry of page.keys) {
        const year = parseYearFromKey(entry.name);
        if (year === null) continue;
        const metadata = entry.metadata;
        if (metadata && typeof metadata.lastScrapedAt === 'string') {
          result.set(year, metadata.lastScrapedAt);
        }
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return result;
  }

  async save(year: number, fixtures: readonly Fixture[]): Promise<void> {
    const key = artifactKey(year);
    const { value, metadata } = encodeArtifact(year, fixtures);
    try {
      await this.kv.put(key, value, { metadata });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new FixtureStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }
}
