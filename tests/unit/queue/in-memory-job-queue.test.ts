import { describe, it, expect } from 'vitest';
import { InMemoryJobQueue } from '../../../src/infrastructure/queue/in-memory-job-queue.js';
import type { ScrapeJob } from '../../../src/application/ports/job-queue.js';

const sampleJob: ScrapeJob = {
  type: 'scrape-match-results',
  version: 1,
  year: 2026,
  round: 10,
};

describe('InMemoryJobQueue', () => {
  it('publishes valid jobs and exposes them via drain', async () => {
    const q = new InMemoryJobQueue();
    await q.publish(sampleJob);

    const batch = q.drain();
    expect(batch.handles).toHaveLength(1);
    expect(batch.handles[0].body).toEqual(sampleJob);
    expect(batch.handles[0].attemptCount).toBe(1);
  });

  it('throws on publish of a schema-invalid body', async () => {
    const q = new InMemoryJobQueue();
    await expect(
      // @ts-expect-error — deliberately malformed
      q.publish({ type: 'scrape-match-results', year: 2026, round: 10 })
    ).rejects.toThrow(/schema validation failed/);
  });

  it('ack removes the message — drain returns empty afterwards', async () => {
    const q = new InMemoryJobQueue();
    await q.publish(sampleJob);
    const batch = q.drain();
    batch.handles[0].ack();
    expect(q.drain().handles).toHaveLength(0);
    expect(q.size()).toBe(0);
  });

  it('retry redelivers and increments attempt counter', async () => {
    const q = new InMemoryJobQueue({ maxRetries: 3 });
    await q.publish(sampleJob);

    const first = q.drain();
    expect(first.handles[0].attemptCount).toBe(1);
    first.handles[0].retry();

    const second = q.drain();
    expect(second.handles).toHaveLength(1);
    expect(second.handles[0].attemptCount).toBe(2);
  });

  it('retry with delaySeconds hides the message until time advances', async () => {
    let now = 1_000_000;
    const q = new InMemoryJobQueue({ maxRetries: 3, now: () => now });
    await q.publish(sampleJob);

    const first = q.drain();
    first.handles[0].retry({ delaySeconds: 30 });

    // Before the delay elapses, the message is invisible
    expect(q.drain().handles).toHaveLength(0);
    expect(q.size()).toBe(1);

    // After the delay, it becomes visible again
    now += 30_000;
    const second = q.drain();
    expect(second.handles).toHaveLength(1);
  });

  it('routes a message to the DLQ once max_retries is reached', async () => {
    const q = new InMemoryJobQueue({ maxRetries: 2 });
    await q.publish(sampleJob);

    // attempt 1 → retry
    let batch = q.drain();
    expect(batch.handles[0].attemptCount).toBe(1);
    batch.handles[0].retry();

    // attempt 2 → retry — budget now exhausted
    batch = q.drain();
    expect(batch.handles[0].attemptCount).toBe(2);
    batch.handles[0].retry();

    // No further delivery; message is in DLQ
    expect(q.drain().handles).toHaveLength(0);
    const dlq = q.getDLQ();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].body).toEqual(sampleJob);
    expect(dlq[0].reason).toBe('retry-budget-exhausted');
    expect(dlq[0].attemptCount).toBe(2);
  });

  it('settles each handle exactly once — a second ack/retry is a no-op', async () => {
    const q = new InMemoryJobQueue();
    await q.publish(sampleJob);
    const batch = q.drain();
    batch.handles[0].ack();
    batch.handles[0].retry(); // no effect
    expect(q.drain().handles).toHaveLength(0);
    expect(q.getDLQ()).toHaveLength(0);
  });

  it('ackAll / retryAll iterate over every handle in the batch', async () => {
    const q = new InMemoryJobQueue({ maxRetries: 3 });
    await q.publish({ ...sampleJob, round: 1 });
    await q.publish({ ...sampleJob, round: 2 });

    const batch = q.drain();
    expect(batch.handles).toHaveLength(2);
    batch.ackAll();
    expect(q.drain().handles).toHaveLength(0);
  });
});
