/**
 * Contract test for POST /api/scrape/draw — asserts the 202 ack envelope
 * shape and that exactly one scrape-draw job is enqueued per request.
 *
 * Feature: 038-kv-fixture-repository (T030).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as handlers from '../../src/api/handlers.js';
import type { HandlerDeps } from '../../src/api/handlers.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/in-memory-job-queue.js';
import { InMemoryFixtureRepository } from '../../src/infrastructure/persistence/in-memory-fixture-repository.js';

describe('POST /api/scrape/draw — contract', () => {
  let app: Hono;
  let queue: InMemoryJobQueue;

  beforeEach(() => {
    queue = new InMemoryJobQueue();
    const deps = {
      fixtureRepository: new InMemoryFixtureRepository(),
      jobProducer: queue,
    } as unknown as HandlerDeps;
    app = new Hono();
    app.post('/api/scrape/draw', handlers.triggerScrape(deps));
  });

  it('returns 202 with the ack envelope shape', async () => {
    const res = await app.request('/api/scrape/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026 }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      enqueued: true,
      job: { type: 'scrape-draw', year: 2026 },
    });
    expect(typeof body.message).toBe('string');
  });

  it('publishes exactly one scrape-draw job per request', async () => {
    await app.request('/api/scrape/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026 }),
    });
    expect(queue.size()).toBe(1);
    const batch = queue.drain();
    expect(batch.handles).toHaveLength(1);
    expect(batch.handles[0].body).toEqual({ type: 'scrape-draw', version: 1, year: 2026 });
  });
});
