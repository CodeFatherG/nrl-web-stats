/**
 * MatchResultsScrapeWatermarkRepository — domain port for the durable
 * cross-isolate match-results scrape watermark (feature 040).
 *
 * Consulted by `ScrapeMatchResultsUseCase` to suppress redundant scrapes
 * across worker isolates. The freshness predicate (30-minute in-progress
 * TTL; `allCompleted ⇒ skip forever`) lives in the use case, not here.
 *
 * No "cache" / "TTL" / "KV" vocabulary appears in this file — those are
 * infrastructure concerns belonging to the use-case predicate and the
 * KV adapter respectively.
 */

/** Watermark recording that the match-results scraper has visited a
 *  (year, round) pair, when, and whether the round was fully completed at
 *  the time of that visit. */
export interface MatchResultsScrapeWatermark {
  readonly year: number;
  readonly round: number;
  /** ISO-8601 timestamp of the most recent successful scrape that produced
   *  this watermark. */
  readonly lastScrapedAt: string;
  /** True iff every scheduled match in the round had MatchStatus.Completed
   *  at scrape time. Once true, ScrapeMatchResultsUseCase's freshness
   *  predicate skips the round permanently. */
  readonly allCompleted: boolean;
}

/** Thrown by `markScraped` when the underlying KV store reports daily
 *  write-quota exhaustion. Classified terminal by
 *  HandleScrapeJobUseCase.classifyError (DLQ, not retry). The in-memory
 *  adapter never throws this. */
export class MatchResultsScrapeWatermarkStoreQuotaExhaustedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'MatchResultsScrapeWatermarkStoreQuotaExhaustedError';
  }
}

export interface MatchResultsScrapeWatermarkRepository {
  /** Read the stored watermark for (year, round), or null on miss / decode
   *  failure. The freshness check is the caller's responsibility. */
  findByRound(year: number, round: number): Promise<MatchResultsScrapeWatermark | null>;

  /** Record a fresh watermark for (year, round). Called exactly once per
   *  successful scrape that actually performed the HTTP fetch + parse +
   *  D1 writes. lastScrapedAt is set to the moment of the call. */
  markScraped(year: number, round: number, allCompleted: boolean): Promise<void>;

  /** Discovery probe — returns round → watermark for every (year, round)
   *  that has a stored watermark for the year. Backed by keys-only
   *  kv.list({ metadata: true }) so no value reads are required. */
  listScrapedRounds(year: number): Promise<Map<number, MatchResultsScrapeWatermark>>;
}
