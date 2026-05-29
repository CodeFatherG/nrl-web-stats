/**
 * KvLeagueRoundProjectionsRepository — Cloudflare Workers KV adapter for the
 * LeagueRoundProjectionsRepository port.
 *
 * Key layout:
 *   league-round-projections:v2:{year}:{round}
 *
 * Each key carries `{ asOfRound: number }` metadata so coverage probes
 * (`kv.list({ metadata: true })`) read the watermark without fetching values.
 *
 * v2 bump: filter to players named in team lists. Stale v1 artifacts include
 * unnamed/injured players and must not satisfy the coverage check — both
 * listings and reads must miss them so discovery re-emits.
 */

import {
  LeagueRoundProjectionsStoreQuotaExhaustedError,
  type LeagueRoundProjectionsArtifact,
  type LeagueRoundProjectionsRepository,
} from '../../domain/repositories/league-round-projections-repository.js';
import { decodeArtifact, encodeArtifact } from './league-round-projections-envelope.js';
import { wrapKvErrors } from './kv-errors.js';
import { pagedKvList } from './kv-list.js';

const KEY_PREFIX = 'league-round-projections:v2';

function yearPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}

function artifactKey(year: number, round: number): string {
  return `${yearPrefix(year)}${round}`;
}

interface CoverageMetadata {
  readonly asOfRound: number;
}

export class KvLeagueRoundProjectionsRepository
  implements LeagueRoundProjectionsRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findByYearAndRound(
    year: number,
    round: number,
  ): Promise<LeagueRoundProjectionsArtifact | null> {
    const raw = await this.kv.get(artifactKey(year, round));
    return decodeArtifact(raw);
  }

  async listCoveredRounds(year: number): Promise<Map<number, number>> {
    const prefix = yearPrefix(year);
    const entries = await pagedKvList<CoverageMetadata, [number, number]>({
      kv: this.kv,
      prefix,
      transform: (key, metadata) => {
        if (!metadata) return null;
        const tail = key.slice(prefix.length);
        const round = Number.parseInt(tail, 10);
        return Number.isFinite(round) ? [round, metadata.asOfRound] : null;
      },
    });
    return new Map(entries);
  }

  async save(artifact: LeagueRoundProjectionsArtifact): Promise<void> {
    const key = artifactKey(artifact.year, artifact.round);
    const metadata: CoverageMetadata = { asOfRound: artifact.asOfRound };
    await wrapKvErrors({
      op: () => this.kv.put(key, encodeArtifact(artifact), { metadata }),
      wrapQuotaAs: cause =>
        new LeagueRoundProjectionsStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          cause,
        ),
    });
  }
}
