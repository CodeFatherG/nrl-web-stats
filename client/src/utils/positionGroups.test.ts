import { describe, it, expect } from 'vitest';
import { getRadarAxes } from './positionGroups';

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
