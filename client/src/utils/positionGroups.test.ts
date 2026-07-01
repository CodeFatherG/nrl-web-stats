import { describe, it, expect } from 'vitest';
import { getRadarAxes, getRadarAxesFromSupercoach } from './positionGroups';

describe('getRadarAxes', () => {
  it('single forward group returns forward axes', () => {
    const axes = getRadarAxes(['prop']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalTacklesMade');
    expect(keys).toContain('totalOffloads');
    expect(keys).toContain('avgScScore');
    expect(keys).not.toContain('totalTries');
    expect(keys).not.toContain('totalKicks');
  });

  it('hooker group returns hooker axes including tryAssists and dummyHalfRuns', () => {
    const axes = getRadarAxes(['hooker']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('tryAssists');
    expect(keys).toContain('dummyHalfRuns');
    expect(keys).toContain('totalTacklesMade');
  });

  it('half group returns halfback axes including kicks and lineBreakAssists', () => {
    const axes = getRadarAxes(['halfback']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalKicks');
    expect(keys).toContain('lineBreakAssists');
    expect(keys).toContain('tryAssists');
  });

  it('back group returns back axes including totalTries and totalInterceptions', () => {
    const axes = getRadarAxes(['wing']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalTries');
    expect(keys).toContain('totalInterceptions');
    expect(keys).not.toContain('totalTacklesMade');
  });

  it('multiple groups return deduplicated union', () => {
    const axes = getRadarAxes(['prop', 'halfback']);
    const keys = axes.map(a => a.key);
    // includes both groups
    expect(keys).toContain('totalOffloads'); // forward
    expect(keys).toContain('totalKicks');    // half
    // no duplicates
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('avgScScore never appears more than once even with multiple groups', () => {
    const axes = getRadarAxes(['prop', 'hooker', 'halfback', 'wing']);
    const scAvgCount = axes.filter(a => a.key === 'avgScScore').length;
    expect(scAvgCount).toBe(1);
  });

  it('unknown position returns full union of all axes', () => {
    const all = getRadarAxes(['interchange']);
    const single = getRadarAxes(['prop']);
    expect(all.length).toBeGreaterThan(single.length);
  });

  it('empty positions array returns full union', () => {
    const axes = getRadarAxes([]);
    expect(axes.length).toBeGreaterThan(0);
  });

  it('winger alias maps to back group', () => {
    const winger = getRadarAxes(['winger']);
    const wing = getRadarAxes(['wing']);
    expect(winger.map(a => a.key)).toEqual(wing.map(a => a.key));
  });

  it('case insensitive position strings', () => {
    const axes = getRadarAxes(['Prop', 'LOCK']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalTacklesMade');
  });
});

describe('getRadarAxesFromSupercoach', () => {
  it('FRF resolves to forward axes', () => {
    const axes = getRadarAxesFromSupercoach(['FRF']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalOffloads');
    expect(keys).not.toContain('totalKicks');
  });

  it('HOK resolves to hooker axes', () => {
    const axes = getRadarAxesFromSupercoach(['HOK']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('dummyHalfRuns');
  });

  it('HFB resolves to half axes', () => {
    const axes = getRadarAxesFromSupercoach(['HFB']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalKicks');
    expect(keys).toContain('lineBreakAssists');
  });

  it('5/8 (with literal slash) resolves to half axes (does NOT split on slash)', () => {
    const axes = getRadarAxesFromSupercoach(['5/8']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalKicks');
    expect(keys).toContain('lineBreakAssists');
  });

  it('CTW resolves to back axes', () => {
    const axes = getRadarAxesFromSupercoach(['CTW']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalTries');
  });

  it('FLB resolves to back axes', () => {
    const axes = getRadarAxesFromSupercoach(['FLB']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalTries');
  });

  it('dual HFB,CTW unions half and back axes', () => {
    const axes = getRadarAxesFromSupercoach(['HFB,CTW']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalKicks');  // half
    expect(keys).toContain('totalTries');  // back
  });

  it('multiple players union their groups', () => {
    const axes = getRadarAxesFromSupercoach(['HOK', 'HFB']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('dummyHalfRuns'); // hooker
    expect(keys).toContain('totalKicks');    // half
    expect(keys).not.toContain('totalTries'); // back not included
  });

  it('null and undefined inputs are skipped', () => {
    const axes = getRadarAxesFromSupercoach([null, undefined, 'FRF']);
    const keys = axes.map(a => a.key);
    expect(keys).toContain('totalOffloads');
  });

  it('returns ALL_AXES when no token resolves to a known group', () => {
    const axes = getRadarAxesFromSupercoach(['WFB', 'INT']);
    // Falls back to full union when nothing recognized
    const single = getRadarAxesFromSupercoach(['HOK']);
    expect(axes.length).toBeGreaterThan(single.length);
  });

  it('empty input returns ALL_AXES', () => {
    const axes = getRadarAxesFromSupercoach([]);
    expect(axes.length).toBeGreaterThan(0);
  });
});
