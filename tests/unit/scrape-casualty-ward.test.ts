import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapeCasualtyWardUseCase } from '../../src/application/use-cases/scrape-casualty-ward.js';
import type { CasualtyWardSource, CasualtyWardPlayerData } from '../../src/domain/ports/casualty-ward-source.js';
import type { CasualtyWardRepository } from '../../src/domain/repositories/casualty-ward-repository.js';
import type { CasualtyWardEntry } from '../../src/domain/casualty-ward-entry.js';
import { success, failure } from '../../src/domain/result.js';

function makePlayer(overrides: Partial<CasualtyWardPlayerData> = {}): CasualtyWardPlayerData {
  return {
    firstName: 'Jack',
    lastName: 'Gosiewski',
    teamNickname: 'Broncos',
    injury: 'Concussion',
    expectedReturn: 'Round 4',
    profileUrl: 'https://www.nrl.com/players/nrl-premiership/broncos/jack-gosiewski/',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<CasualtyWardEntry> = {}): CasualtyWardEntry {
  return {
    id: 1,
    firstName: 'Jack',
    lastName: 'Gosiewski',
    teamCode: 'BRO',
    injury: 'Concussion',
    expectedReturn: 'Round 4',
    startDate: '2026-03-20',
    endDate: null,
    playerId: null,
    ...overrides,
  };
}

describe('ScrapeCasualtyWardUseCase', () => {
  let source: CasualtyWardSource;
  let repository: CasualtyWardRepository;
  let useCase: ScrapeCasualtyWardUseCase;

  beforeEach(() => {
    source = {
      fetchCasualtyWard: vi.fn(),
    };
    repository = {
      insert: vi.fn().mockImplementation(async (entry) => ({ ...entry, id: Math.floor(Math.random() * 1000) })),
      update: vi.fn(),
      findOpen: vi.fn().mockResolvedValue([]),
      findByPlayerId: vi.fn().mockResolvedValue([]),
      findAll: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
      findRecentlyClosedByKey: vi.fn().mockResolvedValue(null),
      reopen: vi.fn(),
    };
    useCase = new ScrapeCasualtyWardUseCase(source, repository);
  });

  it('creates new entries for players appearing on casualty ward', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([makePlayer(), makePlayer({ firstName: 'Nathan', lastName: 'Cleary', teamNickname: 'Panthers', injury: 'Knee', expectedReturn: 'Round 6' })])
    );

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(2);
    expect(result.closedEntries).toBe(0);
    expect(result.updatedEntries).toBe(0);
    expect(repository.insert).toHaveBeenCalledTimes(2);
  });

  it('closes records for players no longer on casualty ward', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(success([]));
    vi.mocked(repository.findOpen).mockResolvedValue([makeEntry()]);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(0);
    expect(result.closedEntries).toBe(1);
    expect(repository.close).toHaveBeenCalledWith(1, '2026-03-25');
  });

  it('does not create duplicates for unchanged players', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([makePlayer()])
    );
    vi.mocked(repository.findOpen).mockResolvedValue([makeEntry()]);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(0);
    expect(result.closedEntries).toBe(0);
    expect(result.updatedEntries).toBe(0);
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.close).not.toHaveBeenCalled();
  });

  it('updates existing record when injury changes', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([makePlayer({ injury: 'ACL' })])
    );
    vi.mocked(repository.findOpen).mockResolvedValue([makeEntry()]);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.updatedEntries).toBe(1);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ injury: 'ACL' })
    );
  });

  it('updates existing record when expectedReturn changes', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([makePlayer({ expectedReturn: 'Round 8' })])
    );
    vi.mocked(repository.findOpen).mockResolvedValue([makeEntry()]);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.updatedEntries).toBe(1);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ expectedReturn: 'Round 8' })
    );
  });

  it('creates new record when previously closed player reappears', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([makePlayer({ injury: 'Hamstring' })])
    );
    // No open records (previous one was closed)
    vi.mocked(repository.findOpen).mockResolvedValue([]);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(1);
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Jack',
        lastName: 'Gosiewski',
        teamCode: 'BRO',
        injury: 'Hamstring',
        startDate: '2026-03-25',
        endDate: null,
      })
    );
  });

  it('returns failure when source fetch fails', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      failure('HTTP 503')
    );

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(false);
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.close).not.toHaveBeenCalled();
  });

  it('does not close records when source fails (FR-011)', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      failure('Network error')
    );
    vi.mocked(repository.findOpen).mockResolvedValue([makeEntry()]);

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(false);
    expect(repository.close).not.toHaveBeenCalled();
  });

  it('warns on unknown team nickname', async () => {
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([makePlayer({ teamNickname: 'Unknown Team' })])
    );

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('CASUALTY_WARD_UNKNOWN_TEAM');
    expect(result.newEntries).toBe(0);
  });

  it('handles mixed scenario: new, unchanged, updated, and closed', async () => {
    // Existing open records: Player A (unchanged), Player B (will be closed)
    vi.mocked(repository.findOpen).mockResolvedValue([
      makeEntry({ id: 1, firstName: 'Jack', lastName: 'Gosiewski' }),
      makeEntry({ id: 2, firstName: 'Adam', lastName: 'Reynolds', injury: 'Ribs' }),
    ]);

    // Scraped: Player A (unchanged), Player C (new)
    vi.mocked(source.fetchCasualtyWard).mockResolvedValue(
      success([
        makePlayer(), // Jack Gosiewski - unchanged
        makePlayer({ firstName: 'Nathan', lastName: 'Cleary', teamNickname: 'Panthers', injury: 'Knee', expectedReturn: 'Round 6' }),
      ])
    );

    const result = await useCase.execute('2026-03-25');

    expect(result.success).toBe(true);
    expect(result.newEntries).toBe(1);      // Nathan Cleary
    expect(result.closedEntries).toBe(1);   // Adam Reynolds
    expect(result.updatedEntries).toBe(0);  // Jack unchanged
  });
});
