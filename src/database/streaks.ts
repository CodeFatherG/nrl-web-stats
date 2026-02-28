/**
 * Streak analysis module for identifying Soft Draws and Rough Patches
 * in a team's season schedule based on strength rating categories.
 *
 * ── RULES ──
 *
 * Soft Draw:
 *   • 3+ easy games IN A ROW are required to start an soft draw.
 *   • Once started, the streak continues until 2+ non-easy games
 *     occur in a row — then the streak ends at the last easy game
 *     before the consecutive non-easy pair.
 *   • A single non-easy game does NOT break an soft draw.
 *
 * Rough Patch:
 *   • 2+ hard games are required to form a rough patch.
 *   • A rough patch must START on a hard game — leading medium games
 *     do not begin a rough patch.
 *   • Medium games are NEUTRAL — they neither start nor break a rough
 *     patch (they are skipped when counting hard games).
 *   • Any easy game immediately ends a rough patch sequence.
 *   • The rough patch spans from the first hard game to the last hard
 *     game in the sequence (including any medium rounds between them).
 *
 * General:
 *   • Bye rounds are always filtered out — they don't break or
 *     contribute to any streak.
 *   • Rough patches are detected first (pass 1). Soft draws are
 *     then detected in the remaining gaps (pass 2).
 */

import type {
  Streak,
  StreakSummary,
  TeamSeasonRanking,
  TeamRoundRanking,
} from '../models/types.js';

/**
 * Analyse a team's season ranking data to identify Soft Draws and Rough Patches.
 */
export function analyseTeamStreaks(ranking: TeamSeasonRanking): Streak[] {
  // Filter out byes and sort by round number
  const rounds = ranking.rounds
    .filter((r) => !r.isBye)
    .sort((a, b) => a.round - b.round);

  if (rounds.length === 0) {
    return [];
  }

  // Pass 1: Detect Rough Patches
  const roughPatches = detectRoughPatches(rounds);

  // Build a set of rounds consumed by rough patches
  const roughPatchRounds = new Set<number>();
  for (const rp of roughPatches) {
    for (const r of rounds) {
      if (r.round >= rp.startRound && r.round <= rp.endRound) {
        roughPatchRounds.add(r.round);
      }
    }
  }

  // Pass 2: Detect Soft Draws in remaining gaps
  const softDraws = detectSoftDraws(rounds, roughPatchRounds);

  // Combine and sort by startRound
  return [...roughPatches, ...softDraws].sort(
    (a, b) => a.startRound - b.startRound
  );
}

/**
 * Pass 1: Detect Rough Patches.
 *
 * Scan rounds collecting non-easy sequences. Easy games break the sequence.
 * Within each sequence, if there are 2+ hard games, it's a rough patch.
 * Medium games are included in the sequence but don't count as hard.
 */
function detectRoughPatches(rounds: TeamRoundRanking[]): Streak[] {
  const streaks: Streak[] = [];
  let currentSequence: TeamRoundRanking[] = [];

  for (const round of rounds) {
    if (round.category === 'easy') {
      maybeEmitRoughPatch(currentSequence, streaks);
      currentSequence = [];
    } else {
      currentSequence.push(round);
    }
  }

  // Check trailing sequence
  maybeEmitRoughPatch(currentSequence, streaks);

  return streaks;
}

/**
 * If the sequence contains 2+ hard rounds, emit a rough patch
 * spanning from the first hard game to the last hard game
 * (including any medium games between them).
 */
function maybeEmitRoughPatch(
  sequence: TeamRoundRanking[],
  streaks: Streak[]
): void {
  if (sequence.length === 0) return;

  const firstHardIdx = sequence.findIndex((r) => r.category === 'hard');
  if (firstHardIdx === -1) return;

  let lastHardIdx = -1;
  for (let i = sequence.length - 1; i >= 0; i--) {
    if (sequence[i].category === 'hard') {
      lastHardIdx = i;
      break;
    }
  }

  // Need at least 2 hard games
  if (firstHardIdx === lastHardIdx) return;

  const patchSlice = sequence.slice(firstHardIdx, lastHardIdx + 1);
  streaks.push({
    type: 'rough_patch',
    startRound: patchSlice[0].round,
    endRound: patchSlice[patchSlice.length - 1].round,
    rounds: patchSlice.length,
    favourableCount: 0,
    unfavourableCount: patchSlice.length,
  });
}

/**
 * Pass 2: Detect Easy Streaks in gaps between rough patches.
 *
 * Split remaining rounds into segments (separated by rough patch rounds),
 * then scan each segment for soft draws.
 */
function detectSoftDraws(
  rounds: TeamRoundRanking[],
  roughPatchRounds: Set<number>
): Streak[] {
  const streaks: Streak[] = [];
  let currentSegment: TeamRoundRanking[] = [];

  for (const round of rounds) {
    if (roughPatchRounds.has(round.round)) {
      scanSegmentForSoftDraws(currentSegment, streaks);
      currentSegment = [];
    } else {
      currentSegment.push(round);
    }
  }

  // Check trailing segment
  scanSegmentForSoftDraws(currentSegment, streaks);

  return streaks;
}

/**
 * Scan a segment for soft draws.
 *
 * Algorithm:
 * 1. Scan forward looking for 3 consecutive easy games → start a streak.
 * 2. Once started, continue scanning. Track consecutive non-easy games.
 *    - If a non-easy game appears, increment the counter.
 *    - If an easy game appears, reset the counter and record its position.
 *    - If the counter reaches 2, the streak ends at the last easy game.
 * 3. The streak spans from the first easy that started it to the last
 *    easy game before the break (or end of segment).
 */
function scanSegmentForSoftDraws(
  segment: TeamRoundRanking[],
  streaks: Streak[]
): void {
  let i = 0;

  while (i < segment.length) {
    // Look for 3 consecutive easy games to start a soft draw
    if (
      i + 2 < segment.length &&
      segment[i].category === 'easy' &&
      segment[i + 1].category === 'easy' &&
      segment[i + 2].category === 'easy'
    ) {
      // Soft draw has started at index i
      let lastEasyIdx = i + 2;
      let consecutiveNonEasy = 0;
      let j = i + 3;

      while (j < segment.length) {
        if (segment[j].category === 'easy') {
          consecutiveNonEasy = 0;
          lastEasyIdx = j;
        } else {
          consecutiveNonEasy++;
          if (consecutiveNonEasy >= 2) {
            break;
          }
        }
        j++;
      }

      // Build the soft draw from i to lastEasyIdx (inclusive)
      const streakSlice = segment.slice(i, lastEasyIdx + 1);
      const favourableCount = streakSlice.filter(
        (r) => r.category === 'easy'
      ).length;

      streaks.push({
        type: 'soft_draw',
        startRound: segment[i].round,
        endRound: segment[lastEasyIdx].round,
        rounds: streakSlice.length,
        favourableCount,
        unfavourableCount: streakSlice.length - favourableCount,
      });

      // Resume scanning after the streak
      i = lastEasyIdx + 1;
    } else {
      i++;
    }
  }
}

/**
 * Build summary statistics from a list of streaks.
 */
export function buildStreakSummary(streaks: Streak[]): StreakSummary {
  const softDraws = streaks.filter((s) => s.type === 'soft_draw');
  const roughPatches = streaks.filter((s) => s.type === 'rough_patch');

  return {
    softDrawCount: softDraws.length,
    roughPatchCount: roughPatches.length,
    longestSoftDraw:
      softDraws.length > 0
        ? Math.max(...softDraws.map((s) => s.rounds))
        : null,
    longestRoughPatch:
      roughPatches.length > 0
        ? Math.max(...roughPatches.map((s) => s.rounds))
        : null,
  };
}
