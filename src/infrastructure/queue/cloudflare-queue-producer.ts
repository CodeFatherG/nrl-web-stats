/**
 * CloudflareQueueProducer — adapts a Cloudflare Queues producer binding to JobProducer.
 *
 * Validates every body against the Zod schema before sending so that bad
 * payloads from misbehaving callers fail fast at this boundary, not in the
 * consumer.
 */

import type { JobProducer, ScrapeJob } from '../../application/ports/job-queue.js';
import { ScrapeJobSchema } from '../../application/ports/job-queue.js';

/**
 * Minimal subset of Cloudflare's Queue<T> interface that we depend on.
 * Defined locally so this file can compile without @cloudflare/workers-types
 * being a build-time dependency of the application layer.
 */
export interface CfQueueLike<T> {
  send(message: T): Promise<void>;
  sendBatch(messages: ReadonlyArray<{ body: T }>): Promise<void>;
}

export class CloudflareQueueProducer implements JobProducer {
  constructor(private readonly queue: CfQueueLike<ScrapeJob>) {}

  async publish(job: ScrapeJob): Promise<void> {
    const parsed = ScrapeJobSchema.safeParse(job);
    if (!parsed.success) {
      throw new Error(
        `CloudflareQueueProducer.publish: schema validation failed — ${parsed.error.issues[0].message}`
      );
    }
    await this.queue.send(parsed.data as ScrapeJob);
  }

  async publishBatch(jobs: readonly ScrapeJob[]): Promise<void> {
    const validated: ScrapeJob[] = [];
    for (const job of jobs) {
      const parsed = ScrapeJobSchema.safeParse(job);
      if (!parsed.success) {
        throw new Error(
          `CloudflareQueueProducer.publishBatch: schema validation failed for job — ${parsed.error.issues[0].message}`
        );
      }
      validated.push(parsed.data as ScrapeJob);
    }
    await this.queue.sendBatch(validated.map(body => ({ body })));
  }
}
