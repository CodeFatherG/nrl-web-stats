/**
 * KvTeamStrengthRankingsRepository — Cloudflare Workers KV adapter for
 * `TeamStrengthRankingsRepository` (feature 039).
 *
 * Key layout:
 *   team-strength-rankings:v1:{year}:thresholds
 *   team-strength-rankings:v1:{year}:season
 *   team-strength-rankings:v1:{year}:round:{round}
 *
 * Each key carries `{ asOfRound: number }` metadata so coverage probes
 * (`kv.list({ metadata: true })`) can read the watermark without fetching
 * the value.
 */

import {
  TeamStrengthRankingsStoreQuotaExhaustedError,
  type RankingsYearPayload,
  type TeamStrengthRankingsRepository,
} from '../../domain/repositories/team-strength-rankings-repository.js';
import type {
  SeasonThresholds,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';
import {
  decodeRoundEnvelope,
  decodeSeasonEnvelope,
  decodeThresholdsEnvelope,
  encodeRoundEnvelope,
  encodeSeasonEnvelope,
  encodeThresholdsEnvelope,
} from './team-strength-rankings-envelope.js';

const KEY_PREFIX = 'team-strength-rankings:v1';

function yearPrefix(year: number): string {
  return `${KEY_PREFIX}:${year}:`;
}

function thresholdsKey(year: number): string {
  return `${yearPrefix(year)}thresholds`;
}

function seasonKey(year: number): string {
  return `${yearPrefix(year)}season`;
}

function roundKey(year: number, round: number): string {
  return `${yearPrefix(year)}round:${round}`;
}

function roundsListPrefix(year: number): string {
  return `${yearPrefix(year)}round:`;
}

interface CoverageMetadata {
  readonly asOfRound: number;
}

function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /KV PUT failed: 429.*Daily limit exceeded/i.test(err.message);
}

export class KvTeamStrengthRankingsRepository
  implements TeamStrengthRankingsRepository {
  constructor(private readonly kv: KVNamespace) {}

  async findSeasonThresholds(year: number): Promise<SeasonThresholds | null> {
    const raw = await this.kv.get(thresholdsKey(year));
    return decodeThresholdsEnvelope(raw);
  }

  async findSeasonRankings(
    year: number,
  ): Promise<ReadonlyMap<string, TeamSeasonRanking> | null> {
    const raw = await this.kv.get(seasonKey(year));
    return decodeSeasonEnvelope(raw);
  }

  async findRoundRankings(
    year: number,
    round: number,
  ): Promise<ReadonlyMap<string, TeamRoundRanking> | null> {
    const raw = await this.kv.get(roundKey(year, round));
    return decodeRoundEnvelope(raw);
  }

  async listCoveredRoundRankings(year: number): Promise<Map<number, number>> {
    const prefix = roundsListPrefix(year);
    const out = new Map<number, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<CoverageMetadata>({ prefix, cursor });
      for (const entry of page.keys) {
        if (!entry.metadata) continue;
        const tail = entry.name.slice(prefix.length);
        const round = Number.parseInt(tail, 10);
        if (!Number.isFinite(round)) continue;
        out.set(round, entry.metadata.asOfRound);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }

  async listYearsWithThresholds(): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list<CoverageMetadata>({
        prefix: `${KEY_PREFIX}:`,
        cursor,
      });
      for (const entry of page.keys) {
        if (!entry.name.endsWith(':thresholds')) continue;
        if (!entry.metadata) continue;
        const yearStr = entry.name.slice(
          `${KEY_PREFIX}:`.length,
          entry.name.length - ':thresholds'.length,
        );
        const year = Number.parseInt(yearStr, 10);
        if (!Number.isFinite(year)) continue;
        out.set(year, entry.metadata.asOfRound);
      }
      if (page.list_complete) break;
      cursor = page.cursor;
      if (!cursor) break;
    }
    return out;
  }

  async saveYear(
    year: number,
    asOfRound: number,
    payload: RankingsYearPayload,
  ): Promise<void> {
    const computedAt = new Date().toISOString();
    const metadata: CoverageMetadata = { asOfRound };

    // Write order matters: thresholds → season → rounds (ascending). The
    // discovery predicate's `?? -1` sentinel turns missing round keys into
    // "stale" so a partial-write failure naturally re-enqueues the year.
    await this.putWrapped(
      thresholdsKey(year),
      encodeThresholdsEnvelope(asOfRound, computedAt, payload.thresholds),
      metadata,
    );
    await this.putWrapped(
      seasonKey(year),
      encodeSeasonEnvelope(asOfRound, computedAt, payload.season),
      metadata,
    );

    const sortedRounds = Array.from(payload.roundRankings.keys()).sort(
      (a, b) => a - b,
    );
    for (const round of sortedRounds) {
      const rankings = payload.roundRankings.get(round);
      if (!rankings) continue;
      await this.putWrapped(
        roundKey(year, round),
        encodeRoundEnvelope(asOfRound, computedAt, rankings),
        metadata,
      );
    }
  }

  private async putWrapped(
    key: string,
    value: string,
    metadata: CoverageMetadata,
  ): Promise<void> {
    try {
      await this.kv.put(key, value, { metadata });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        throw new TeamStrengthRankingsStoreQuotaExhaustedError(
          `KV daily write quota exhausted while writing ${key}`,
          err,
        );
      }
      throw err;
    }
  }
}
