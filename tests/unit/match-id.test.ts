/**
 * Unit tests for createMatchId utility
 */

import { describe, it, expect } from 'vitest';
import { createMatchId } from '../../client/src/utils/matchId';

describe('createMatchId', () => {
  it('creates ID with teams sorted alphabetically', () => {
    expect(createMatchId(2025, 5, 'SYD', 'BRI')).toBe('2025-R5-BRI-SYD');
  });

  it('maintains order when teams are already sorted', () => {
    expect(createMatchId(2025, 5, 'BRI', 'SYD')).toBe('2025-R5-BRI-SYD');
  });

  it('produces same ID regardless of team order', () => {
    const id1 = createMatchId(2025, 1, 'MEL', 'CRO');
    const id2 = createMatchId(2025, 1, 'CRO', 'MEL');
    expect(id1).toBe(id2);
    expect(id1).toBe('2025-R1-CRO-MEL');
  });

  it('includes round number without padding', () => {
    expect(createMatchId(2025, 1, 'BRI', 'SYD')).toBe('2025-R1-BRI-SYD');
    expect(createMatchId(2025, 27, 'BRI', 'SYD')).toBe('2025-R27-BRI-SYD');
  });

  it('handles same team code (edge case)', () => {
    expect(createMatchId(2025, 1, 'BRI', 'BRI')).toBe('2025-R1-BRI-BRI');
  });
});
