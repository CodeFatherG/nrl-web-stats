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

import { z } from 'zod';
import {
  TeamStrengthRankingsStoreQuotaExhaustedError,
  type RankingsYearPayload,
  type TeamStrengthRankingsRepository,
} from '../../domain/repositories/team-strength-rankings-repository.js';
import type {
  SeasonThresholds,
  StrengthCategory,
  TeamRoundRanking,
  TeamSeasonRanking,
} from '../../models/types.js';
import { parseEnvelopeJson } from './envelope.js';
import { pagedKvList } from './kv-list.js';

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

// NOTE (FR-012, follow-up observation logged for spec 041 T055): this regex is
// strictly narrower than the canonical isQuotaExhaustedError in kv-errors.ts —
// it only matches messages of the form "KV PUT failed: 429 ... Daily limit
// exceeded". Adopting the canonical predicate would slightly broaden quota
// detection (different behaviour), so the per-adapter try/catch and regex are
// preserved verbatim for byte-identity. Reconciliation is a follow-up, not
// in-scope for the envelope-extraction refactor.
function isQuotaExhaustedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /KV PUT failed: 429.*Daily limit exceeded/i.test(err.message);
}

// ── Wire envelopes (shape A2 RW-flat — three subtypes) ──────────────────────

export const CURRENT_SCHEMA_VERSION = 1 as const;

const StrengthCategoryEnum = z.enum(['hard', 'medium', 'easy']);

const SeasonThresholdsSchema = z.object({
  p33: z.number(),
  p67: z.number(),
  lowerFence: z.number(),
  upperFence: z.number(),
});

const TeamRoundRankingSchema = z.object({
  teamCode: z.string(),
  year: z.number().int(),
  round: z.number().int().positive(),
  strengthRating: z.number(),
  percentile: z.number(),
  category: StrengthCategoryEnum,
  opponentCode: z.string().nullable(),
  isHome: z.boolean(),
  isBye: z.boolean(),
});

const TeamSeasonRankingSchema = z.object({
  teamCode: z.string(),
  year: z.number().int(),
  totalStrength: z.number(),
  averageStrength: z.number(),
  matchCount: z.number().int().nonnegative(),
  byeCount: z.number().int().nonnegative(),
  percentile: z.number(),
  category: StrengthCategoryEnum,
  rounds: z.array(TeamRoundRankingSchema),
});

const ThresholdsEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  asOfRound: z.number().int().nonnegative(),
  payload: SeasonThresholdsSchema,
});

const SeasonEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  asOfRound: z.number().int().nonnegative(),
  payload: z.array(z.tuple([z.string(), TeamSeasonRankingSchema])),
});

const RoundEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  computedAt: z.string(),
  asOfRound: z.number().int().nonnegative(),
  payload: z.array(z.tuple([z.string(), TeamRoundRankingSchema])),
});

export function encodeThresholdsEnvelope(
  asOfRound: number,
  computedAt: string,
  thresholds: SeasonThresholds,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    asOfRound,
    payload: thresholds,
  });
}

function decodeThresholdsEnvelope(raw: string | null): SeasonThresholds | null {
  const env = parseEnvelopeJson(raw, ThresholdsEnvelopeSchema);
  return env ? env.payload : null;
}

export function encodeSeasonEnvelope(
  asOfRound: number,
  computedAt: string,
  season: ReadonlyMap<string, TeamSeasonRanking>,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    asOfRound,
    payload: Array.from(season.entries()),
  });
}

function decodeSeasonEnvelope(
  raw: string | null,
): ReadonlyMap<string, TeamSeasonRanking> | null {
  const env = parseEnvelopeJson(raw, SeasonEnvelopeSchema);
  if (!env) return null;
  const map = new Map<string, TeamSeasonRanking>();
  for (const [code, ranking] of env.payload) {
    map.set(code, {
      ...ranking,
      category: ranking.category as StrengthCategory,
      rounds: ranking.rounds.map(r => ({
        ...r,
        category: r.category as StrengthCategory,
      })),
    });
  }
  return map;
}

export function encodeRoundEnvelope(
  asOfRound: number,
  computedAt: string,
  rounds: ReadonlyMap<string, TeamRoundRanking>,
): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    computedAt,
    asOfRound,
    payload: Array.from(rounds.entries()),
  });
}

function decodeRoundEnvelope(
  raw: string | null,
): ReadonlyMap<string, TeamRoundRanking> | null {
  const env = parseEnvelopeJson(raw, RoundEnvelopeSchema);
  if (!env) return null;
  const map = new Map<string, TeamRoundRanking>();
  for (const [code, ranking] of env.payload) {
    map.set(code, {
      ...ranking,
      category: ranking.category as StrengthCategory,
    });
  }
  return map;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

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

  async listYearsWithThresholds(): Promise<Map<number, number>> {
    const prefix = `${KEY_PREFIX}:`;
    const entries = await pagedKvList<CoverageMetadata, [number, number]>({
      kv: this.kv,
      prefix,
      transform: (key, metadata) => {
        if (!key.endsWith(':thresholds')) return null;
        if (!metadata) return null;
        const yearStr = key.slice(prefix.length, key.length - ':thresholds'.length);
        const year = Number.parseInt(yearStr, 10);
        return Number.isFinite(year) ? [year, metadata.asOfRound] : null;
      },
    });
    return new Map(entries);
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
