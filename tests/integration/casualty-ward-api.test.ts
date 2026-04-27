/**
 * Integration test for casualty ward scraping and API endpoints.
 * Tests the full pipeline: adapter → use case → repository → API handlers
 * with mocked HTTP responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrapeCasualtyWardUseCase } from '../../src/application/use-cases/scrape-casualty-ward.js';
import { NrlComCasualtyWardAdapter } from '../../src/infrastructure/adapters/nrl-com-casualty-ward-adapter.js';
import type { CasualtyWardRepository } from '../../src/domain/repositories/casualty-ward-repository.js';
import type { CasualtyWardEntry } from '../../src/domain/casualty-ward-entry.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures/nrl-com');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

function mockFetchResponse(data: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Server Error',
    json: () => Promise.resolve(data),
  }));
}

/** Simple in-memory repository for integration testing */
class InMemoryCasualtyWardRepository implements CasualtyWardRepository {
  private entries: CasualtyWardEntry[] = [];
  private nextId = 1;

  async insert(entry: CasualtyWardEntry): Promise<CasualtyWardEntry> {
    const inserted = { ...entry, id: this.nextId++ };
    this.entries.push(inserted);
    return inserted;
  }

  async update(entry: CasualtyWardEntry): Promise<void> {
    const idx = this.entries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      this.entries[idx] = { ...entry };
    }
  }

  async findOpen(): Promise<CasualtyWardEntry[]> {
    return this.entries.filter(e => e.endDate === null);
  }

  async findByPlayerId(playerId: string): Promise<CasualtyWardEntry[]> {
    return this.entries.filter(e => e.playerId === playerId).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async findAll(): Promise<CasualtyWardEntry[]> {
    return [...this.entries].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async close(id: number, endDate: string): Promise<void> {
    const entry = this.entries.find(e => e.id === id);
    if (entry) {
      const idx = this.entries.indexOf(entry);
      this.entries[idx] = { ...entry, endDate };
    }
  }

  async findRecentlyClosedByKey(
    firstName: string,
    lastName: string,
    teamCode: string,
    date: string,
  ): Promise<CasualtyWardEntry | null> {
    return this.entries.find(
      e =>
        e.firstName.toLowerCase() === firstName.toLowerCase() &&
        e.lastName.toLowerCase() === lastName.toLowerCase() &&
        e.teamCode === teamCode &&
        e.endDate === date,
    ) ?? null;
  }

  async reopen(id: number): Promise<void> {
    const entry = this.entries.find(e => e.id === id);
    if (entry) {
      const idx = this.entries.indexOf(entry);
      this.entries[idx] = { ...entry, endDate: null };
    }
  }
}

describe('Casualty Ward Integration', () => {
  let adapter: NrlComCasualtyWardAdapter;
  let repository: InMemoryCasualtyWardRepository;
  let useCase: ScrapeCasualtyWardUseCase;

  beforeEach(() => {
    adapter = new NrlComCasualtyWardAdapter();
    repository = new InMemoryCasualtyWardRepository();
    useCase = new ScrapeCasualtyWardUseCase(adapter, repository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('end-to-end: first scrape creates records for all players', async () => {
    const fixtureData = loadFixture('casualty-ward.json');
    mockFetchResponse(fixtureData);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(5);
    expect(result.closedEntries).toBe(0);

    const open = await repository.findOpen();
    expect(open).toHaveLength(5);
    expect(open.map(e => e.lastName).sort()).toEqual([
      'Cleary', 'Gosiewski', 'Haas', 'Munster', 'Reynolds',
    ]);
  });

  it('end-to-end: second scrape with same data creates no duplicates', async () => {
    const fixtureData = loadFixture('casualty-ward.json');

    // First scrape
    mockFetchResponse(fixtureData);
    await useCase.execute('2026-03-25');

    // Second scrape with same data
    vi.restoreAllMocks();
    mockFetchResponse(fixtureData);
    const result = await useCase.execute('2026-03-26');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(0);
    expect(result.closedEntries).toBe(0);
    expect(result.updatedEntries).toBe(0);

    const open = await repository.findOpen();
    expect(open).toHaveLength(5); // No duplicates
  });

  it('end-to-end: player removal closes record with end date', async () => {
    // First scrape with 5 players
    mockFetchResponse(loadFixture('casualty-ward.json'));
    await useCase.execute('2026-03-25');

    // Second scrape with empty list (all players returned)
    vi.restoreAllMocks();
    mockFetchResponse(loadFixture('casualty-ward-empty.json'));
    const result = await useCase.execute('2026-03-26');

    expect(result.success).toBe(true);
    expect(result.closedEntries).toBe(5);

    const open = await repository.findOpen();
    expect(open).toHaveLength(0);

    const all = await repository.findAll();
    expect(all).toHaveLength(5);
    for (const entry of all) {
      expect(entry.endDate).toBe('2026-03-26');
    }
  });

  it('end-to-end: team nickname resolution maps correctly', async () => {
    mockFetchResponse(loadFixture('casualty-ward.json'));
    await useCase.execute('2026-03-25');

    const open = await repository.findOpen();

    const broncos = open.filter(e => e.teamCode === 'BRO');
    expect(broncos).toHaveLength(3); // Gosiewski, Reynolds, Haas

    const panthers = open.filter(e => e.teamCode === 'PTH');
    expect(panthers).toHaveLength(1); // Cleary

    const storm = open.filter(e => e.teamCode === 'MEL');
    expect(storm).toHaveLength(1); // Munster
  });

  it('end-to-end: source failure does not close existing records', async () => {
    // First scrape succeeds
    mockFetchResponse(loadFixture('casualty-ward.json'));
    await useCase.execute('2026-03-25');

    // Second scrape fails
    vi.restoreAllMocks();
    mockFetchResponse({}, 503);
    const result = await useCase.execute('2026-03-26');

    expect(result.success).toBe(false);

    // Records should still be open
    const open = await repository.findOpen();
    expect(open).toHaveLength(5);
  });
});
