/**
 * CloudflareJobBatch — adapts MessageBatch<ScrapeJob> + per-Message ack/retry
 * to the JobBatch / JobHandle ports.
 *
 * Messages whose bodies fail Zod validation are immediately dead-lettered via
 * the producer (with reason 'schema-validation-failed') and never appear in
 * `handles[]`. This means dispatchers never see a JobHandle for a malformed
 * message — the contract from contracts/job-queue.md §"No toDLQ() method".
 */

import type { JobBatch, JobHandle, ScrapeJob } from '../../application/ports/job-queue.js';
import { ScrapeJobSchema } from '../../application/ports/job-queue.js';
import { logger } from '../../utils/logger.js';

/** Local minimal subset of Cloudflare's Message<T> shape. */
export interface CfMessageLike<T> {
  readonly id: string;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(opts?: { delaySeconds?: number }): void;
}

/** Local minimal subset of Cloudflare's MessageBatch<T> shape. */
export interface CfMessageBatchLike<T> {
  readonly messages: ReadonlyArray<CfMessageLike<T>>;
  readonly queue: string;
  ackAll(): void;
  retryAll(opts?: { delaySeconds?: number }): void;
}

/** Adapter that constructs a JobBatch from a Cloudflare MessageBatch. */
export function fromCfMessageBatch(
  batch: CfMessageBatchLike<unknown>,
  options: {
    /** Producer for the DLQ — used to immediately dead-letter schema-invalid messages.
     *  Optional: if absent, schema-invalid messages are acked-and-logged (data loss
     *  acceptable because the payload is malformed and would never be processable). */
    deadLetterProducer?: { send(body: unknown): Promise<void> };
  } = {}
): JobBatch<ScrapeJob> {
  const handles: JobHandle<ScrapeJob>[] = [];

  for (const msg of batch.messages) {
    const parsed = ScrapeJobSchema.safeParse(msg.body);
    if (!parsed.success) {
      logger.error('Queue message failed Zod validation — routing to DLQ', {
        event: 'job.dlq',
        reason: 'schema-validation-failed',
        messageId: msg.id,
        issues: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        body: msg.body,
      });
      if (options.deadLetterProducer) {
        // Best-effort DLQ publish; if it fails we still ack the original so it
        // doesn't keep redelivering — malformed messages can't repair themselves.
        options.deadLetterProducer
          .send({
            reason: 'schema-validation-failed',
            originalBody: msg.body,
            messageId: msg.id,
            timestamp: new Date().toISOString(),
          })
          .catch(err => {
            logger.error('Failed to publish schema-invalid message to DLQ', {
              error: err instanceof Error ? err.message : 'unknown',
              messageId: msg.id,
            });
          });
      }
      msg.ack(); // Drop from main queue; the DLQ publish (above) is the durable record.
      continue;
    }
    handles.push(makeHandle(msg, parsed.data as ScrapeJob));
  }

  return {
    handles,
    ackAll: () => batch.ackAll(),
    retryAll: (opts) => batch.retryAll(opts),
  };
}

function makeHandle(msg: CfMessageLike<unknown>, body: ScrapeJob): JobHandle<ScrapeJob> {
  let settled = false;
  return {
    body,
    attemptCount: msg.attempts,
    ack(): void {
      if (settled) return;
      settled = true;
      msg.ack();
    },
    retry(opts?: { delaySeconds?: number }): void {
      if (settled) return;
      settled = true;
      // Cloudflare clamps delaySeconds internally — we don't need to.
      msg.retry(opts);
    },
  };
}
