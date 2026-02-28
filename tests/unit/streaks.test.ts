/**
 * Unit tests for streak analysis algorithm
 *
 * Only "easy" category = favourable. "Hard" = unfavourable.
 * "Medium" is neutral — doesn't start a rough patch but doesn't stop one.
 * 2+ hard games in a sequence (bridged by medium) form a rough patch.
 * Easy games break any sequence. Minimum 3 rounds for a soft draw.
 */

import { describe, it, expect } from 'vitest';
import {
  analyseTeamStreaks,
  buildStreakSummary,
} from '../../src/database/streaks.js';
import type {
  TeamSeasonRanking,
  TeamRoundRanking,
  StrengthCategory,
} from '../../src/models/types.js';

/** Helper to create a TeamRoundRanking with minimal required fields */
function makeRound(
  round: number,
  category: StrengthCategory,
  isBye = false
): TeamRoundRanking {
  return {
    teamCode: 'MEL',
    year: 2026,
    round,
    strengthRating: category === 'hard' ? 100 : category === 'medium' ? 300 : 500,
    percentile: category === 'hard' ? 0.2 : category === 'medium' ? 0.5 : 0.8,
    category,
    opponentCode: isBye ? null : 'BRO',
    isHome: true,
    isBye,
  };
}

/** Helper to create a TeamSeasonRanking wrapping given rounds */
function makeRanking(rounds: TeamRoundRanking[]): TeamSeasonRanking {
  const nonByes = rounds.filter((r) => !r.isBye);
  return {
    teamCode: 'MEL',
    year: 2026,
    totalStrength: nonByes.reduce((sum, r) => sum + r.strengthRating, 0),
    averageStrength: nonByes.length > 0
      ? Math.round(
          nonByes.reduce((sum, r) => sum + r.strengthRating, 0) / nonByes.length
        )
      : 0,
    matchCount: nonByes.length,
    byeCount: rounds.length - nonByes.length,
    percentile: 0.5,
    category: 'medium',
    rounds,
  };
}

describe('analyseTeamStreaks', () => {
  // ─── Rough Patch Detection ───

  it('identifies a rough patch from 2 consecutive hard rounds', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'hard'),
      makeRound(4, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(1);
    expect(roughPatches[0]).toMatchObject({
      type: 'rough_patch',
      startRound: 2,
      endRound: 3,
      rounds: 2,
      favourableCount: 0,
      unfavourableCount: 2,
    });
  });

  it('identifies a rough patch when medium bridges 2 hard rounds (hard, medium, hard)', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'medium'),
      makeRound(4, 'hard'),
      makeRound(5, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(1);
    expect(roughPatches[0]).toMatchObject({
      type: 'rough_patch',
      startRound: 2,
      endRound: 4,
      rounds: 3,
    });
  });

  it('does NOT create a rough patch from hard, medium, medium (only 1 hard)', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'medium'),
      makeRound(4, 'medium'),
      makeRound(5, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(0);
  });

  it('does NOT create a rough patch when easy breaks the sequence (hard, medium, easy, hard)', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'medium'),
      makeRound(4, 'easy'),
      makeRound(5, 'hard'),
      makeRound(6, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(0);
  });

  it('does NOT create a rough patch from 2 consecutive medium rounds', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'medium'),
      makeRound(3, 'medium'),
      makeRound(4, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(0);
  });

  it('does NOT create a rough patch from a single hard round', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(0);
  });

  it('rough patch starts at first hard, not leading mediums (medium, medium, hard, hard, medium, hard)', () => {
    const ranking = makeRanking([
      makeRound(1, 'medium'),
      makeRound(2, 'medium'),
      makeRound(3, 'hard'),
      makeRound(4, 'hard'),
      makeRound(5, 'medium'),
      makeRound(6, 'hard'),
      makeRound(7, 'easy'),
      makeRound(8, 'hard'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(1);
    expect(roughPatches[0]).toMatchObject({
      type: 'rough_patch',
      startRound: 3,
      endRound: 6,
      rounds: 4,
    });
  });

  it('rough patch starts at first hard with single leading medium (medium, hard, medium, hard, medium, hard)', () => {
    const ranking = makeRanking([
      makeRound(1, 'medium'),
      makeRound(2, 'hard'),
      makeRound(3, 'medium'),
      makeRound(4, 'hard'),
      makeRound(5, 'medium'),
      makeRound(6, 'hard'),
      makeRound(7, 'easy'),
      makeRound(8, 'hard'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(1);
    expect(roughPatches[0]).toMatchObject({
      type: 'rough_patch',
      startRound: 2,
      endRound: 6,
      rounds: 5,
    });
  });

  it('rough patch does not include trailing mediums after last hard', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'hard'),
      makeRound(4, 'medium'),
      makeRound(5, 'medium'),
      makeRound(6, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(1);
    expect(roughPatches[0]).toMatchObject({
      type: 'rough_patch',
      startRound: 2,
      endRound: 3,
      rounds: 2,
    });
  });

  // ─── Soft Draw Detection ───

  it('identifies a soft draw from 3+ easy rounds', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const softDraws = streaks.filter((s) => s.type === 'soft_draw');
    expect(softDraws).toHaveLength(1);
    expect(softDraws[0]).toMatchObject({
      type: 'soft_draw',
      startRound: 1,
      endRound: 3,
      rounds: 3,
      favourableCount: 3,
      unfavourableCount: 0,
    });
  });

  it('does NOT start a soft draw without 3 consecutive easy games (easy, easy, hard, easy, easy)', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'hard'),
      makeRound(4, 'easy'),
      makeRound(5, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    // Never has 3 consecutive easy games, so no soft draw starts
    const softDraws = streaks.filter((s) => s.type === 'soft_draw');
    expect(softDraws).toHaveLength(0);
  });

  it('identifies a soft draw with a single non-easy game AFTER 3 consecutive easy', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'easy'),
      makeRound(4, 'hard'),
      makeRound(5, 'easy'),
      makeRound(6, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    // 3 consecutive easy starts the streak, single hard doesn't break it
    const softDraws = streaks.filter((s) => s.type === 'soft_draw');
    expect(softDraws).toHaveLength(1);
    expect(softDraws[0]).toMatchObject({
      type: 'soft_draw',
      startRound: 1,
      endRound: 6,
      rounds: 6,
      favourableCount: 5,
      unfavourableCount: 1,
    });
  });

  it('does not create a soft draw from fewer than 3 rounds', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);
    expect(streaks).toEqual([]);
  });

  it('does not create a soft draw when majority is not easy', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'medium'),
      makeRound(3, 'medium'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const softDraws = streaks.filter((s) => s.type === 'soft_draw');
    expect(softDraws).toHaveLength(0);
  });

  it('identifies one large soft draw when entire season is easy', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'easy'),
      makeRound(4, 'easy'),
      makeRound(5, 'easy'),
      makeRound(6, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    expect(streaks).toHaveLength(1);
    expect(streaks[0]).toMatchObject({
      type: 'soft_draw',
      startRound: 1,
      endRound: 6,
      rounds: 6,
      favourableCount: 6,
      unfavourableCount: 0,
    });
  });

  // ─── Mixed Seasons ───

  it('identifies both soft draws and rough patches in a mixed season', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'easy'),
      makeRound(4, 'hard'),
      makeRound(5, 'hard'),
      makeRound(6, 'easy'),
      makeRound(7, 'easy'),
      makeRound(8, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    expect(streaks).toHaveLength(3);

    expect(streaks[0]).toMatchObject({
      type: 'soft_draw',
      startRound: 1,
      endRound: 3,
      rounds: 3,
    });

    expect(streaks[1]).toMatchObject({
      type: 'rough_patch',
      startRound: 4,
      endRound: 5,
      rounds: 2,
    });

    expect(streaks[2]).toMatchObject({
      type: 'soft_draw',
      startRound: 6,
      endRound: 8,
      rounds: 3,
    });
  });

  it('medium bridging hard creates rough patch that splits soft draws', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'easy'),
      makeRound(4, 'hard'),
      makeRound(5, 'medium'),
      makeRound(6, 'hard'),
      makeRound(7, 'easy'),
      makeRound(8, 'easy'),
      makeRound(9, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    expect(streaks).toHaveLength(3);

    expect(streaks[0]).toMatchObject({
      type: 'soft_draw',
      startRound: 1,
      endRound: 3,
      rounds: 3,
    });

    // hard, medium, hard = rough patch
    expect(streaks[1]).toMatchObject({
      type: 'rough_patch',
      startRound: 4,
      endRound: 6,
      rounds: 3,
    });

    expect(streaks[2]).toMatchObject({
      type: 'soft_draw',
      startRound: 7,
      endRound: 9,
      rounds: 3,
    });
  });

  // ─── Bye Handling ───

  it('skips bye rounds — byes do not break or contribute to streaks', () => {
    const ranking = makeRanking([
      makeRound(1, 'hard'),
      makeRound(2, 'easy', true), // bye
      makeRound(3, 'hard'),
      makeRound(4, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    const roughPatches = streaks.filter((s) => s.type === 'rough_patch');
    expect(roughPatches).toHaveLength(1);
    expect(roughPatches[0]).toMatchObject({
      type: 'rough_patch',
      startRound: 1,
      endRound: 3,
      rounds: 2,
      favourableCount: 0,
      unfavourableCount: 2,
    });
  });

  // ─── Edge Cases ───

  it('handles empty rounds gracefully', () => {
    const ranking = makeRanking([]);
    const streaks = analyseTeamStreaks(ranking);
    expect(streaks).toEqual([]);
  });

  it('returns empty array when no qualifying streaks exist (easy, hard, easy)', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'hard'),
      makeRound(3, 'easy'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    // No 3 consecutive easy → no soft draw. Single hard → no rough patch.
    expect(streaks).toEqual([]);
  });

  it('trailing rough patch at end of season', () => {
    const ranking = makeRanking([
      makeRound(1, 'easy'),
      makeRound(2, 'easy'),
      makeRound(3, 'easy'),
      makeRound(4, 'hard'),
      makeRound(5, 'hard'),
    ]);

    const streaks = analyseTeamStreaks(ranking);

    expect(streaks).toHaveLength(2);
    expect(streaks[0]).toMatchObject({ type: 'soft_draw', startRound: 1, endRound: 3 });
    expect(streaks[1]).toMatchObject({ type: 'rough_patch', startRound: 4, endRound: 5 });
  });
});

describe('buildStreakSummary', () => {
  it('calculates summary stats correctly', () => {
    const streaks = [
      {
        type: 'soft_draw' as const,
        startRound: 1,
        endRound: 5,
        rounds: 5,
        favourableCount: 4,
        unfavourableCount: 1,
      },
      {
        type: 'rough_patch' as const,
        startRound: 8,
        endRound: 11,
        rounds: 4,
        favourableCount: 0,
        unfavourableCount: 4,
      },
      {
        type: 'soft_draw' as const,
        startRound: 15,
        endRound: 20,
        rounds: 6,
        favourableCount: 5,
        unfavourableCount: 1,
      },
    ];

    const summary = buildStreakSummary(streaks);

    expect(summary).toEqual({
      softDrawCount: 2,
      roughPatchCount: 1,
      longestSoftDraw: 6,
      longestRoughPatch: 4,
    });
  });

  it('returns null for longest when no streaks of that type exist', () => {
    const summary = buildStreakSummary([]);

    expect(summary).toEqual({
      softDrawCount: 0,
      roughPatchCount: 0,
      longestSoftDraw: null,
      longestRoughPatch: null,
    });
  });
});
