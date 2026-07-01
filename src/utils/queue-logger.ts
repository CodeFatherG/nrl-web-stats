/**
 * Structured queue-lifecycle log helpers.
 *
 * Emits the normalized event shape from research.md §R8 so operators can
 * filter Cloudflare Logs by `event:` across every adapter and use case.
 */

import { logger } from './logger.js';
import type { ScrapeJob, ScrapeJobType } from '../application/ports/job-queue.js';

interface DiscoveryLogContext {
  jobCounts: Partial<Record<ScrapeJobType, number>>;
  totalPublished: number;
  totalSkipped: number;
}

export const queueLogger = {
  /** Discovery completed: jobs were published (or, in shadow mode, would have been). */
  discoveryPublished(context: DiscoveryLogContext & { shadowMode?: boolean }): void {
    logger.info('queue.discovery.published', {
      event: 'discovery.published',
      ...context,
    });
  },

  /** A job has been pulled from the queue and dispatcher is about to run it. */
  jobReceived(job: ScrapeJob, attemptCount: number): void {
    logger.info('queue.job.received', {
      event: 'job.received',
      jobType: job.type,
      payload: job,
      attemptCount,
    });
  },

  /** Job ran to completion successfully and has been acked. */
  jobAcked(job: ScrapeJob, attemptCount: number, durationMs: number): void {
    logger.info('queue.job.acked', {
      event: 'job.acked',
      jobType: job.type,
      payload: job,
      attemptCount,
      durationMs,
    });
  },

  /** Job failed transiently; returning to the queue for redelivery. */
  jobRetry(job: ScrapeJob, attemptCount: number, reason: string, delaySeconds?: number): void {
    logger.warn('queue.job.retry', {
      event: 'job.retry',
      jobType: job.type,
      payload: job,
      attemptCount,
      reason,
      delaySeconds,
    });
  },

  /** Job exhausted retries (or was classified terminal) — routed to DLQ. */
  jobDlq(job: ScrapeJob, attemptCount: number, reason: string): void {
    logger.error('queue.job.dlq', {
      event: 'job.dlq',
      jobType: job.type,
      payload: job,
      attemptCount,
      reason,
    });
  },
};
