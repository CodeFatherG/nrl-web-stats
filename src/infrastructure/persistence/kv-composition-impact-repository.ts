/**
 * KvCompositionImpactRepository — Cloudflare Workers KV adapter for
 * CompositionImpactRepository.
 *
 * Feature: 037-analytics-cache-replacement (T013).
 */

import {
  CompositionImpactStoreQuotaExhaustedError,
  type CompositionImpactAggregate,
  type CompositionImpactRepository,
} from '../../domain/repositories/composition-impact-repository.js';
import {
  decodeCompositionImpactAggregate,
  encodeCompositionImpactAggregate,
} from './composition-impact-envelope.js';

const KEY_PREFIX = 'composition-impact:v1';

function yearPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}

function aggregateKey(year: number, teamCode: string): string {
  return `${yearPrefix(year)}${teamCode}`;
}

interface CoverageMetadata {
  readonly asOfRound: number;
}

function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (!/429/.test(msg)) return false;
  return /daily limit|rate limit|quota/i.test(msg);
}

export class KvCompositionImpactRepository
  implements CompositionImpactRepository
{
  constructor(private readonly kv: KVNamespace) {}

  async findCompositionImpactAggregate(
    year: number,
    teamCode: string,
  ): Promise<CompositionImpactAggregate | null> {
    const raw = await this.kv.get(aggregateKey(year, teamCode));
    return decodeCompositionImpactAggregate(raw);
  }

  async listCompositionImpactAsOfRounds(
    year: number,
  ): Promise<Map<string, number>> {
    const prefix = yearPrefix(year);
    const out = new Map<string, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<CoverageMetadata>({ prefix, cursor });
      for (const entry of page.keys) {
        if (!entry.metadata) continue;
        const ident = entry.name.slice(prefix.length);
        if (ident.length === 0) continue;
        out.set(ident, entry.metadata.asOfRound);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }

  async saveCompositionImpactAggregate(
    aggregate: CompositionImpactAggregate,
  ): Promise<void> {
    const key = aggregateKey(aggregate.year, aggregate.teamCode);
    try {
      await this.kv.put(key, encodeCompositionImpactAggregate(aggregate), {
        metadata: { asOfRound: aggregate.asOfRound } satisfies CoverageMetadata,
      });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new CompositionImpactStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }
}
