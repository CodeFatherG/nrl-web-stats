/**
 * InMemoryJobQueue — synchronous in-memory adapter for ports/job-queue.
 *
 * Implements both JobProducer (publish side) and a consumer side (drain into
 * JobBatch). Validates every body against the Zod schema on publish so that
 * test harnesses get the same fail-fast guarantee the Cloudflare adapter
 * provides at the message boundary.
 *
 * Suitable for unit tests and the in-memory end-to-end harness (T025).
 * Not safe across worker isolates — purely process-local state.
 */

import type {
  JobBatch,
  JobHandle,
  JobProducer,
  ScrapeJob,
} from '../../application/ports/job-queue.js';
import { ScrapeJobSchema } from '../../application/ports/job-queue.js';

interface InMemoryMessage {
  body: ScrapeJob;
  attemptCount: number;
  /** Earliest time (ms since epoch) at which the message becomes redeliverable after a retry. */
  visibleAt: number;
}

export interface DLQEntry {
  body: ScrapeJob;
  reason: string;
  attemptCount: number;
  timestamp: number;
}

export interface InMemoryJobQueueOptions {
  /** Max attempts before the message is routed to the DLQ. Default 3, matching wrangler.jsonc. */
  maxRetries?: number;
  /** Optional clock for deterministic tests. */
  now?: () => number;
}

/** Synchronous in-memory queue. Tests can publish + drain in the same tick. */
export class InMemoryJobQueue implements JobProducer {
  private readonly messages: InMemoryMessage[] = [];
  private readonly dlq: DLQEntry[] = [];
  private readonly maxRetries: number;
  private readonly now: () => number;

  constructor(opts: InMemoryJobQueueOptions = {}) {
    this.maxRetries = opts.maxRetries ?? 3;
    this.now = opts.now ?? Date.now;
  }

  // ---------------------------------------------------------------------
  // Producer side
  // ---------------------------------------------------------------------

  async publish(job: ScrapeJob): Promise<void> {
    const parsed = ScrapeJobSchema.safeParse(job);
    if (!parsed.success) {
      throw new Error(
        `InMemoryJobQueue.publish: schema validation failed — ${parsed.error.issues[0].message}`
      );
    }
    this.messages.push({
      body: parsed.data as ScrapeJob,
      attemptCount: 0,
      visibleAt: this.now(),
    });
  }

  async publishBatch(jobs: readonly ScrapeJob[]): Promise<void> {
    for (const job of jobs) {
      await this.publish(job);
    }
  }

  // ---------------------------------------------------------------------
  // Consumer side
  // ---------------------------------------------------------------------

  /** Number of messages currently visible (excludes delayed-retry messages). */
  visibleCount(): number {
    const t = this.now();
    return this.messages.filter(m => m.visibleAt <= t).length;
  }

  /** Total messages including delayed-retry ones (visible + invisible). */
  size(): number {
    return this.messages.length;
  }

  /** Snapshot of the DLQ — never modified by callers. */
  getDLQ(): readonly DLQEntry[] {
    return [...this.dlq];
  }

  /**
   * Drain up to `max` currently-visible messages into a JobBatch. Each handle's
   * ack/retry mutates this queue synchronously. Messages whose retry budget is
   * exhausted are routed to the DLQ instead of being redelivered.
   */
  drain(max: number = Number.POSITIVE_INFINITY): JobBatch<ScrapeJob> {
    const t = this.now();
    const taken: InMemoryMessage[] = [];

    for (let i = 0; i < this.messages.length && taken.length < max; i++) {
      const msg = this.messages[i];
      if (msg.visibleAt <= t) {
        msg.attemptCount += 1;
        taken.push(msg);
        this.messages.splice(i, 1);
        i--;
      }
    }

    const handles: JobHandle<ScrapeJob>[] = taken.map(msg => this.makeHandle(msg));

    return {
      handles,
      ackAll: () => {
        for (const h of handles) h.ack();
      },
      retryAll: (opts) => {
        for (const h of handles) h.retry(opts);
      },
    };
  }

  private makeHandle(msg: InMemoryMessage): JobHandle<ScrapeJob> {
    let settled = false;
    const queue = this;
    return {
      body: msg.body,
      attemptCount: msg.attemptCount,
      ack(): void {
        if (settled) return;
        settled = true;
      },
      retry(opts?: { delaySeconds?: number }): void {
        if (settled) return;
        settled = true;
        if (msg.attemptCount >= queue.maxRetries) {
          queue.dlq.push({
            body: msg.body,
            reason: 'retry-budget-exhausted',
            attemptCount: msg.attemptCount,
            timestamp: queue.now(),
          });
          return;
        }
        const delayMs = Math.max(0, (opts?.delaySeconds ?? 0)) * 1000;
        queue.messages.push({
          body: msg.body,
          attemptCount: msg.attemptCount,
          visibleAt: queue.now() + delayMs,
        });
      },
    };
  }

  /** Synthetic dead-letter for messages that failed validation outside a handle (test-only helper). */
  deadLetterImmediate(body: unknown, reason: string): void {
    this.dlq.push({
      body: body as ScrapeJob,
      reason,
      attemptCount: 0,
      timestamp: this.now(),
    });
  }
}
