import { describe, it, expect } from 'vitest';
import { resolveTeam, getAllTeams } from '../../../src/domain/team-identity.js';
import type { TeamIdentity } from '../../../src/domain/team-identity.js';

describe('TeamIdentity registry', () => {
  it('contains all 17 NRL teams', () => {
    expect(getAllTeams()).toHaveLength(17);
  });

  it('resolves team by canonical code', () => {
    const team = resolveTeam('MNL');
    expect(team).not.toBeNull();
    expect(team!.code).toBe('MNL');
    expect(team!.name).toBe('Manly Sea Eagles');
    expect(team!.slug).toBe('sea-eagles');
  });

  it('resolves team by slug', () => {
    const team = resolveTeam('sea-eagles');
    expect(team).not.toBeNull();
    expect(team!.code).toBe('MNL');
  });

  it('resolves team by full name', () => {
    const team = resolveTeam('Manly Sea Eagles');
    expect(team).not.toBeNull();
    expect(team!.code).toBe('MNL');
  });

  it('code and slug resolve to the same TeamIdentity instance', () => {
    const byCode = resolveTeam('MNL');
    const bySlug = resolveTeam('sea-eagles');
    expect(byCode).toBe(bySlug);
  });

  it('returns null for unknown identifier', () => {
    expect(resolveTeam('UNKNOWN')).toBeNull();
    expect(resolveTeam('fake-slug')).toBeNull();
    expect(resolveTeam('')).toBeNull();
  });

  it('performs case-insensitive lookup for codes', () => {
    const upper = resolveTeam('MNL');
    const lower = resolveTeam('mnl');
    const mixed = resolveTeam('Mnl');
    expect(upper).toBe(lower);
    expect(upper).toBe(mixed);
  });

  it('performs case-insensitive lookup for slugs', () => {
    const lower = resolveTeam('sea-eagles');
    const upper = resolveTeam('Sea-Eagles');
    expect(lower).toBe(upper);
  });

  it('all teams have readonly fields', () => {
    const team = resolveTeam('MEL')!;
    expect(team.code).toBe('MEL');
    expect(team.name).toBe('Melbourne Storm');
    expect(team.slug).toBe('storm');
    expect(team.numericIds).toEqual({});
    expect(team.aliases).toEqual([]);
  });

  describe('all 17 teams resolve by code, slug, and name', () => {
    const expectedTeams: Array<{ code: string; name: string; slug: string }> = [
      { code: 'BRO', name: 'Brisbane Broncos', slug: 'broncos' },
      { code: 'BUL', name: 'Canterbury Bulldogs', slug: 'bulldogs' },
      { code: 'CBR', name: 'Canberra Raiders', slug: 'raiders' },
      { code: 'DOL', name: 'Dolphins', slug: 'dolphins' },
      { code: 'GCT', name: 'Gold Coast Titans', slug: 'titans' },
      { code: 'MEL', name: 'Melbourne Storm', slug: 'storm' },
      { code: 'MNL', name: 'Manly Sea Eagles', slug: 'sea-eagles' },
      { code: 'NEW', name: 'Newcastle Knights', slug: 'knights' },
      { code: 'NQC', name: 'North Queensland Cowboys', slug: 'cowboys' },
      { code: 'NZL', name: 'New Zealand Warriors', slug: 'warriors' },
      { code: 'PAR', name: 'Parramatta Eels', slug: 'eels' },
      { code: 'PTH', name: 'Penrith Panthers', slug: 'panthers' },
      { code: 'SHA', name: 'Cronulla Sharks', slug: 'sharks' },
      { code: 'STG', name: 'St George Illawarra Dragons', slug: 'dragons' },
      { code: 'STH', name: 'South Sydney Rabbitohs', slug: 'rabbitohs' },
      { code: 'SYD', name: 'Sydney Roosters', slug: 'roosters' },
      { code: 'WST', name: 'Wests Tigers', slug: 'tigers' },
    ];

    for (const expected of expectedTeams) {
      it(`resolves ${expected.code} by code`, () => {
        const team = resolveTeam(expected.code);
        expect(team).not.toBeNull();
        expect(team!.code).toBe(expected.code);
        expect(team!.name).toBe(expected.name);
        expect(team!.slug).toBe(expected.slug);
      });

      it(`resolves ${expected.code} by slug "${expected.slug}"`, () => {
        const team = resolveTeam(expected.slug);
        expect(team).not.toBeNull();
        expect(team!.code).toBe(expected.code);
      });

      it(`resolves ${expected.code} by name "${expected.name}"`, () => {
        const team = resolveTeam(expected.name);
        expect(team).not.toBeNull();
        expect(team!.code).toBe(expected.code);
      });
    }
  });
});
