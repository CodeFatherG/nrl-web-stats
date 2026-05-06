import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { CasualtyWardRepository } from '../../domain/repositories/casualty-ward-repository.js';
import type { PlayerMovementsCache } from '../../analytics/player-movements-cache.js';
import type {
  InjuredRecord,
  DroppedRecord,
  BenchedRecord,
  PromotedRecord,
  CoveringInjuryRecord,
  ReturningFromInjuryRecord,
  PositionChangedRecord,
} from '../../domain/player-movements.js';
import { isStartingPosition, isNamedPosition, normalizePosition } from '../../domain/positions.js';

type MemberSnapshot = { jerseyNumber: number; playerName: string; position: string };
type TeamMemberMap = Map<number, MemberSnapshot>; // playerId → snapshot
type PositionMap = Map<string, Array<{ playerId: number } & MemberSnapshot>>; // normalizePosition(position) → [snapshot, ...]

type CoveringInfo = {
  coveringPlayerId: number;
  coveringPlayerName: string;
  coveringLastJersey: number;
  coveringLastPosition: string;
  prevJersey: number | null;
  prevPosition: string | null;
};

export class ComputePlayerMovementsUseCase {
  constructor(
    private readonly teamListRepo: TeamListRepository,
    private readonly matchRepo: MatchRepository,
    private readonly casualtyWardRepo: CasualtyWardRepository,
    private readonly cache: PlayerMovementsCache
  ) {}

  async execute(year: number, round: number): Promise<void> {
    this.cache.invalidate(year, round);

    const currentMatches = await this.matchRepo.findByYearAndRound(year, round);
    const expectedTeams = new Set<string>();
    const teamToMatchId = new Map<string, string>();
    for (const match of currentMatches) {
      if (match.homeTeamCode) {
        expectedTeams.add(match.homeTeamCode);
        teamToMatchId.set(match.homeTeamCode, match.id);
      }
      if (match.awayTeamCode) {
        expectedTeams.add(match.awayTeamCode);
        teamToMatchId.set(match.awayTeamCode, match.id);
      }
    }

    const currentTeamLists = await this.teamListRepo.findByYearAndRound(year, round);
    const presentTeams = new Set(currentTeamLists.map(tl => tl.teamCode));
    const missingTeams = [...expectedTeams].filter(t => !presentTeams.has(t));
    if (missingTeams.length > 0) {
      console.warn(
        `[PlayerMovements] R${round} ${year}: missing team lists for ${missingTeams.join(', ')}. ` +
        `Expected ${expectedTeams.size} teams, have ${presentTeams.size}: [${[...presentTeams].join(', ')}]`
      );
      return;
    }

    if (round === 1) {
      this.cache.set(year, round, {
        pending: false,
        noPreviousRound: true,
        season: year,
        round,
        injured: [],
        dropped: [],
        benched: [],
        returningFromInjury: [],
        coveringInjury: [],
        promoted: [],
        positionChanged: [],
      });
      return;
    }

    const prevTeamLists = await this.teamListRepo.findByYearAndRound(year, round - 1);

    const prevMatches = await this.matchRepo.findByYearAndRound(year, round - 1);
    const prevTimes = prevMatches.map(m => m.scheduledTime).filter((t): t is string => t !== null);
    const sinceDate =
      prevTimes.length > 0
        ? prevTimes.sort()[0].substring(0, 10)
        : `${year}-01-01`;

    const openEntries = await this.casualtyWardRepo.findOpen();
    const openPlayerMap = new Map<string, { injury: string; expectedReturn: string }>(
      openEntries
        .filter(e => e.playerId !== null)
        .map(e => [e.playerId as string, { injury: e.injury, expectedReturn: e.expectedReturn }])
    );

    const closedEntries = await this.casualtyWardRepo.findRecentlyClosed(sinceDate);
    const closedPlayerIds = new Set(
      closedEntries.filter(e => e.playerId !== null).map(e => e.playerId as string)
    );
    const closedPlayerMap = new Map<string, { injury: string }>(
      closedEntries
        .filter(e => e.playerId !== null)
        .map(e => [e.playerId as string, { injury: e.injury }])
    );

    const currentByTeam = buildTeamMap(currentTeamLists);
    const prevByTeam = buildTeamMap(prevTeamLists);

    const injured: InjuredRecord[] = [];
    const dropped: DroppedRecord[] = [];
    const benched: BenchedRecord[] = [];
    const returningFromInjury: ReturningFromInjuryRecord[] = [];
    const coveringInjury: CoveringInjuryRecord[] = [];
    const promoted: PromotedRecord[] = [];
    const positionChanged: PositionChangedRecord[] = [];

    // Phase 1: absent named players → injured or dropped.
    // "Named" means position is a starting or interchange position.
    for (const teamCode of expectedTeams) {
      const currentMembers = currentByTeam.get(teamCode) ?? new Map<number, MemberSnapshot>();
      const prevMembers = prevByTeam.get(teamCode);
      const matchId = teamToMatchId.get(teamCode) ?? '';

      if (!prevMembers) continue;

      for (const [playerId, prevMember] of prevMembers) {
        if (!currentMembers.has(playerId) && isNamedPosition(prevMember.position)) {
          const cwInfo = openPlayerMap.get(String(playerId));
          if (cwInfo) {
            injured.push({
              playerId,
              playerName: prevMember.playerName,
              teamCode,
              matchId,
              lastJersey: prevMember.jerseyNumber,
              lastPosition: prevMember.position,
              injury: cwInfo.injury,
              expectedReturn: cwInfo.expectedReturn,
            });
          } else {
            dropped.push({
              playerId,
              playerName: prevMember.playerName,
              teamCode,
              matchId,
              lastJersey: prevMember.jerseyNumber,
              lastPosition: prevMember.position,
            });
          }
        }
      }
    }

    // Phase 2: per team, cascade from each injured player's position to build coveringMap.
    // The cascade is entirely position-based: find who currently holds the vacated position,
    // then if they moved from another starting position, cascade to that vacated position too.
    const coveringByTeam = new Map<string, Map<number, CoveringInfo>>();

    for (const teamCode of expectedTeams) {
      const currentMembers = currentByTeam.get(teamCode) ?? new Map<number, MemberSnapshot>();
      const prevMembers = prevByTeam.get(teamCode);
      if (!prevMembers) continue;

      const teamInjured = injured.filter(r => r.teamCode === teamCode);
      if (teamInjured.length === 0) continue;

      // Group all current named starting-position players by canonical position.
      // Multi-player positions (prop, wing, centre, second row) collect all holders.
      const currByPos = new Map<string, Array<{ playerId: number } & MemberSnapshot>>();
      for (const [pid, m] of currentMembers) {
        if (isStartingPosition(m.position)) {
          const pos = normalizePosition(m.position);
          const list = currByPos.get(pos);
          if (list) list.push({ playerId: pid, ...m });
          else currByPos.set(pos, [{ playerId: pid, ...m }]);
        }
      }

      const coveringMap = new Map<number, CoveringInfo>();

      // Group initial vacancies by canonical position so multi-slot positions are paired 1-to-1.
      // This prevents both replacement players being attributed to the same injury when two
      // players at the same position (e.g. both Wings) are injured in the same round.
      const pendingVacancies = new Map<string, InjuredRecord[]>();
      for (const injuredRecord of teamInjured) {
        if (isStartingPosition(injuredRecord.lastPosition)) {
          const pos = normalizePosition(injuredRecord.lastPosition);
          const list = pendingVacancies.get(pos);
          if (list) list.push(injuredRecord);
          else pendingVacancies.set(pos, [injuredRecord]);
        }
      }

      const toProcess: string[] = [...pendingVacancies.keys()];

      while (toProcess.length > 0) {
        const vacatedPosition = toProcess.shift()!;
        const vacancies = pendingVacancies.get(vacatedPosition) ?? [];
        pendingVacancies.delete(vacatedPosition); // consume to prevent stale re-pairing

        if (vacancies.length === 0) continue;

        // Collect candidate movers: not already in coveringMap, not an incumbent, not returning.
        const candidates: Array<{ playerId: number } & MemberSnapshot> = [];
        for (const currPlayer of currByPos.get(vacatedPosition) ?? []) {
          if (coveringMap.has(currPlayer.playerId)) continue;

          const prevMemberData = prevMembers.get(currPlayer.playerId);

          // returningFromInjury takes priority, but only if they actually missed last round
          if (prevMemberData === undefined &&
              (closedPlayerIds.has(String(currPlayer.playerId)) || openPlayerMap.has(String(currPlayer.playerId)))) continue;

          const prevPos = prevMemberData ? normalizePosition(prevMemberData.position) : null;

          // Skip incumbents: they held this position last round too, so they haven't moved
          // to cover — they're just continuing in the same role. Only movers extend the cascade.
          if (prevPos === vacatedPosition) continue;

          candidates.push(currPlayer);
        }

        // Sort both by playerId for deterministic 1-to-1 pairing.
        // Surplus candidates (more movers than vacancies) fall through to Phase 3.
        const sortedVacancies = vacancies.slice().sort((a, b) => a.playerId - b.playerId);
        const sortedCandidates = candidates.slice().sort((a, b) => a.playerId - b.playerId);

        const pairCount = Math.min(sortedVacancies.length, sortedCandidates.length);
        for (let i = 0; i < pairCount; i++) {
          const originalInjured = sortedVacancies[i];
          const currPlayer = sortedCandidates[i];
          const prevMemberData = prevMembers.get(currPlayer.playerId);
          const prevPos = prevMemberData ? normalizePosition(prevMemberData.position) : null;
          const wasNamed = prevMemberData !== undefined && isNamedPosition(prevMemberData.position);

          coveringMap.set(currPlayer.playerId, {
            coveringPlayerId: originalInjured.playerId,
            coveringPlayerName: originalInjured.playerName,
            coveringLastJersey: originalInjured.lastJersey,
            coveringLastPosition: originalInjured.lastPosition,
            prevJersey: wasNamed ? prevMemberData!.jerseyNumber : null,
            prevPosition: wasNamed ? prevMemberData!.position : null,
          });

          // Cascade: this mover vacated their previous starting position — add it as a new vacancy.
          if (prevPos !== null && isStartingPosition(prevMemberData!.position)) {
            const cascadePos = prevPos;
            const existing = pendingVacancies.get(cascadePos);
            if (existing) existing.push(originalInjured);
            else pendingVacancies.set(cascadePos, [originalInjured]);
            if (!toProcess.includes(cascadePos)) toProcess.push(cascadePos);
          }
        }
      }

      if (coveringMap.size > 0) {
        coveringByTeam.set(teamCode, coveringMap);
      }
    }

    // Phase 3: classify all current members with strict priority ordering.
    // Starting status uses isStartingPosition (position-based) throughout.
    for (const teamCode of expectedTeams) {
      const currentMembers = currentByTeam.get(teamCode) ?? new Map<number, MemberSnapshot>();
      const prevMembers = prevByTeam.get(teamCode);
      const matchId = teamToMatchId.get(teamCode) ?? '';
      const coveringMap = coveringByTeam.get(teamCode) ?? new Map<number, CoveringInfo>();

      if (!prevMembers) continue;

      // Position-keyed maps restricted to starting positions (which implies named).
      // Keys are canonical (normalizePosition) so "Winger"/"Wing" and "2nd Row"/"Second Row" unify.
      const currByPosition: PositionMap = new Map();
      for (const [pid, m] of currentMembers) {
        if (isStartingPosition(m.position)) {
          const pos = normalizePosition(m.position);
          const arr = currByPosition.get(pos);
          if (arr) arr.push({ playerId: pid, ...m });
          else currByPosition.set(pos, [{ playerId: pid, ...m }]);
        }
      }

      const prevByPosition: PositionMap = new Map();
      for (const [pid, m] of prevMembers) {
        if (isStartingPosition(m.position)) {
          const pos = normalizePosition(m.position);
          const arr = prevByPosition.get(pos);
          if (arr) arr.push({ playerId: pid, ...m });
          else prevByPosition.set(pos, [{ playerId: pid, ...m }]);
        }
      }

      for (const [playerId, currMember] of currentMembers) {
        const prevMember = prevMembers.get(playerId);
        const isNamed    = isNamedPosition(currMember.position); // in the named squad (position-based)
        const wasNamed   = prevMember !== undefined && isNamedPosition(prevMember.position);
        const isStarting = isStartingPosition(currMember.position);
        const wasStarting = prevMember !== undefined && isStartingPosition(prevMember.position);

        // Reserve (jersey > 17): check for benched.
        // Only a player who was previously named (jersey ≤ 17) at a starting position can be benched.
        // Players who were always reserve (jersey > 17) are not "benched" even if their position label is starting.
        if (!isNamed) {
          if (prevMember && wasStarting && wasNamed) {
            // Was at a starting position, now reserve → benched.
            // "Replaced by": find this player's slot index among previous holders (sorted by playerId),
            // then pick the current holder at the same index. Handles multi-player positions correctly.
            const posKey = normalizePosition(prevMember.position);
            const prevSlotPlayers = (prevByPosition.get(posKey) ?? []).slice().sort((a, b) => a.playerId - b.playerId);
            const currSlotPlayers = (currByPosition.get(posKey) ?? []).slice().sort((a, b) => a.playerId - b.playerId);
            const slotIndex = prevSlotPlayers.findIndex(p => p.playerId === playerId);
            const replacerCandidate = slotIndex >= 0 ? currSlotPlayers[slotIndex] : undefined;
            const replacer = replacerCandidate !== undefined && replacerCandidate.playerId !== playerId
              ? replacerCandidate
              : undefined;
            benched.push({
              playerId,
              playerName: currMember.playerName,
              teamCode,
              matchId,
              prevJersey: prevMember.jerseyNumber,
              prevPosition: prevMember.position,
              currentJersey: currMember.jerseyNumber,
              currentPosition: currMember.position,
              consecutiveRoundsBenched: await this.countConsecutiveBenchedRounds(
                year, round, teamCode, playerId
              ),
              replacedByPlayerId: replacer ? replacer.playerId : null,
              replacedByPlayerName: replacer ? replacer.playerName : null,
            });
          }
          continue;
        }

        // Priority 1: returning from injury — only if they actually missed last round
        if (!prevMember && (closedPlayerIds.has(String(playerId)) || openPlayerMap.has(String(playerId)))) {
          const { lastJersey, lastPosition, lastRound } = await this.findLastKnownPosition(
            year, round - 1, teamCode, playerId, currMember
          );
          const cwInfo = openPlayerMap.get(String(playerId)) ?? closedPlayerMap.get(String(playerId));
          returningFromInjury.push({
            playerId,
            playerName: currMember.playerName,
            teamCode,
            matchId,
            lastJersey,
            lastPosition,
            currentJersey: currMember.jerseyNumber,
            currentPosition: currMember.position,
            positionChanged: normalizePosition(lastPosition) !== normalizePosition(currMember.position),
            injury: cwInfo?.injury ?? '',
            roundsOut: round - 1 - lastRound,
          });
          continue;
        }

        // Priority 2: covering an injured player's slot (direct or cascade)
        const covering = coveringMap.get(playerId);
        if (covering) {
          coveringInjury.push({
            playerId,
            playerName: currMember.playerName,
            teamCode,
            matchId,
            currentJersey: currMember.jerseyNumber,
            currentPosition: currMember.position,
            prevJersey: covering.prevJersey,
            prevPosition: covering.prevPosition,
            coveringPlayerId: covering.coveringPlayerId,
            coveringPlayerName: covering.coveringPlayerName,
            coveringLastJersey: covering.coveringLastJersey,
            coveringLastPosition: covering.coveringLastPosition,
          });
          continue;
        }

        // Priority 3: was named last round.
        // A non-starter moving into a starting position falls through to promoted.
        // Everything else: record a position change only when both prev and curr are starting positions.
        if (prevMember && wasNamed) {
          if (!wasStarting && isStarting) {
            // Was in a non-starting role (interchange/bench), now named at a starting position → promoted
          } else {
            if (wasStarting && isStarting &&
                normalizePosition(prevMember.position) !== normalizePosition(currMember.position)) {
              positionChanged.push({
                playerId,
                playerName: currMember.playerName,
                teamCode,
                matchId,
                oldPosition: prevMember.position,
                newPosition: currMember.position,
                currentJersey: currMember.jerseyNumber,
              });
            }
            continue;
          }
        }

        // Priority 4: new to the named 17 or moving into a starting position from a non-starting role.
        // "Replacing" applies when the previous holder of this starting position has vacated the slot:
        // they are absent, demoted to reserve, or moved to a different position (still named but elsewhere).
        // For multi-player positions (Wing, Prop, Centre, Second Row) find the slot by sorting all
        // current holders by playerId and pairing to the same-indexed previous holder.
        const posKey2 = normalizePosition(currMember.position);
        const currSlotArr = isStarting ? (currByPosition.get(posKey2) ?? []).slice().sort((a, b) => a.playerId - b.playerId) : [];
        const prevSlotArr = isStarting ? (prevByPosition.get(posKey2) ?? []).slice().sort((a, b) => a.playerId - b.playerId) : [];
        const mySlotIndex = currSlotArr.findIndex(p => p.playerId === playerId);
        const prevAtSlot = mySlotIndex >= 0 ? prevSlotArr[mySlotIndex] : undefined;
        const prevHolderInCurr = prevAtSlot !== undefined ? currentMembers.get(prevAtSlot.playerId) : undefined;
        const prevHolderLeft = prevAtSlot !== undefined &&
          (prevHolderInCurr === undefined ||                                                                 // absent (dropped/injured)
           !isNamedPosition(prevHolderInCurr.position) ||                                                   // demoted to reserve (benched)
           normalizePosition(prevHolderInCurr.position) !== normalizePosition(prevAtSlot.position));        // moved to a different position
        promoted.push({
          playerId,
          playerName: currMember.playerName,
          teamCode,
          matchId,
          currentJersey: currMember.jerseyNumber,
          position: currMember.position,
          replacingPlayerId: prevHolderLeft ? prevAtSlot!.playerId : null,
          replacingPlayerName: prevHolderLeft ? prevAtSlot!.playerName : null,
        });
      }
    }

    this.cache.set(year, round, {
      pending: false,
      season: year,
      round,
      injured,
      dropped,
      benched,
      returningFromInjury,
      coveringInjury,
      promoted,
      positionChanged,
    });
  }

  private async countConsecutiveBenchedRounds(
    year: number,
    currentRound: number,
    teamCode: string,
    playerId: number
  ): Promise<number> {
    let count = 1;
    for (let r = currentRound - 1; r >= 1; r--) {
      const lists = await this.teamListRepo.findByYearAndRound(year, r);
      const list = lists.find(tl => tl.teamCode === teamCode);
      if (!list) break;
      const member = list.members.find(m => m.playerId === playerId);
      // Named in the squad (starting or interchange position) means not benched in that round
      if (!member || isNamedPosition(member.position)) break;
      count++;
    }
    return count;
  }

  private async findLastKnownPosition(
    year: number,
    fromRound: number,
    teamCode: string,
    playerId: number,
    fallback: MemberSnapshot
  ): Promise<{ lastJersey: number; lastPosition: string; lastRound: number }> {
    for (let r = fromRound; r >= 1; r--) {
      const lists = await this.teamListRepo.findByYearAndRound(year, r);
      const list = lists.find(tl => tl.teamCode === teamCode);
      if (!list) continue;
      const member = list.members.find(m => m.playerId === playerId);
      if (member) return { lastJersey: member.jerseyNumber, lastPosition: member.position, lastRound: r };
    }
    return { lastJersey: fallback.jerseyNumber, lastPosition: fallback.position, lastRound: fromRound };
  }
}

function buildTeamMap(teamLists: { teamCode: string; members: readonly { playerId: number; jerseyNumber: number; playerName: string; position: string }[] }[]): Map<string, TeamMemberMap> {
  const result = new Map<string, TeamMemberMap>();
  for (const tl of teamLists) {
    const members: TeamMemberMap = new Map();
    for (const m of tl.members) {
      members.set(m.playerId, {
        jerseyNumber: m.jerseyNumber,
        playerName: m.playerName,
        position: m.position,
      });
    }
    result.set(tl.teamCode, members);
  }
  return result;
}
