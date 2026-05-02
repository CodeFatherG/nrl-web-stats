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

type MemberSnapshot = { jerseyNumber: number; playerName: string; position: string };
type TeamMemberMap = Map<number, MemberSnapshot>; // playerId → snapshot

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
    for (const team of expectedTeams) {
      if (!presentTeams.has(team)) return;
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

    const currentByTeam = buildTeamMap(currentTeamLists);
    const prevByTeam = buildTeamMap(prevTeamLists);

    const injured: InjuredRecord[] = [];
    const dropped: DroppedRecord[] = [];
    const benched: BenchedRecord[] = [];
    const returningFromInjury: ReturningFromInjuryRecord[] = [];
    const coveringInjury: CoveringInjuryRecord[] = [];
    const promoted: PromotedRecord[] = [];
    const positionChanged: PositionChangedRecord[] = [];

    // Phase 1: absent starters → injured or dropped
    for (const teamCode of expectedTeams) {
      const currentMembers = currentByTeam.get(teamCode) ?? new Map<number, MemberSnapshot>();
      const prevMembers = prevByTeam.get(teamCode);
      const matchId = teamToMatchId.get(teamCode) ?? '';

      if (!prevMembers) continue;

      for (const [playerId, prevMember] of prevMembers) {
        if (!currentMembers.has(playerId) && prevMember.jerseyNumber <= 17) {
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

    // Phase 2: per team, cascade from each injured player's jersey to build coveringMap
    const coveringByTeam = new Map<string, Map<number, CoveringInfo>>();

    for (const teamCode of expectedTeams) {
      const currentMembers = currentByTeam.get(teamCode) ?? new Map<number, MemberSnapshot>();
      const prevMembers = prevByTeam.get(teamCode);
      if (!prevMembers) continue;

      const teamInjured = injured.filter(r => r.teamCode === teamCode);
      if (teamInjured.length === 0) continue;

      // Reverse lookup: jerseyNumber → playerId + snapshot for current round
      const currentByJersey = new Map<number, { playerId: number } & MemberSnapshot>();
      for (const [playerId, member] of currentMembers) {
        currentByJersey.set(member.jerseyNumber, { playerId, ...member });
      }

      const coveringMap = new Map<number, CoveringInfo>();
      const queue: Array<{ vacatedJersey: number; originalInjured: DroppedRecord }> = [];

      for (const injuredRecord of teamInjured) {
        // Only starting positions (1–13) create a coverage chain; interchange injuries (14+) do not
        if (injuredRecord.lastJersey <= 13) {
          queue.push({ vacatedJersey: injuredRecord.lastJersey, originalInjured: injuredRecord });
        }
      }

      while (queue.length > 0) {
        const { vacatedJersey, originalInjured } = queue.shift()!;

        const currAtJersey = currentByJersey.get(vacatedJersey);
        if (!currAtJersey) continue;
        if (coveringMap.has(currAtJersey.playerId)) continue;
        // returningFromInjury takes priority — their own return is the primary story
        if (closedPlayerIds.has(String(currAtJersey.playerId))) continue;

        const prevMemberData = prevMembers.get(currAtJersey.playerId);
        const wasStarter = prevMemberData !== undefined && prevMemberData.jerseyNumber <= 17;

        coveringMap.set(currAtJersey.playerId, {
          coveringPlayerId: originalInjured.playerId,
          coveringPlayerName: originalInjured.playerName,
          coveringLastJersey: originalInjured.lastJersey,
          coveringLastPosition: originalInjured.lastPosition,
          prevJersey: wasStarter ? prevMemberData!.jerseyNumber : null,
          prevPosition: wasStarter ? prevMemberData!.position : null,
        });

        // Cascade only through starting positions (1–13); interchange moves don't propagate
        if (wasStarter && prevMemberData!.jerseyNumber !== vacatedJersey && prevMemberData!.jerseyNumber <= 13) {
          queue.push({ vacatedJersey: prevMemberData!.jerseyNumber, originalInjured });
        }
      }

      if (coveringMap.size > 0) {
        coveringByTeam.set(teamCode, coveringMap);
      }
    }

    // Phase 3: classify all current members with strict priority ordering
    for (const teamCode of expectedTeams) {
      const currentMembers = currentByTeam.get(teamCode) ?? new Map<number, MemberSnapshot>();
      const prevMembers = prevByTeam.get(teamCode);
      const matchId = teamToMatchId.get(teamCode) ?? '';
      const coveringMap = coveringByTeam.get(teamCode) ?? new Map<number, CoveringInfo>();

      if (!prevMembers) continue;

      // Jersey-keyed reverse lookups for cross-referencing benched ↔ promoted
      const currByJersey = new Map<number, { playerId: number } & MemberSnapshot>();
      for (const [pid, m] of currentMembers) currByJersey.set(m.jerseyNumber, { playerId: pid, ...m });

      const prevByJersey = new Map<number, { playerId: number } & MemberSnapshot>();
      for (const [pid, m] of prevMembers) prevByJersey.set(m.jerseyNumber, { playerId: pid, ...m });

      for (const [playerId, currMember] of currentMembers) {
        const prevMember = prevMembers.get(playerId);
        const isStarter = currMember.jerseyNumber <= 17;
        const wasStarter = prevMember !== undefined && prevMember.jerseyNumber <= 17;

        if (!isStarter) {
          if (prevMember && wasStarter) {
            // Who now occupies the starter slot this player vacated?
            const replacer = currByJersey.get(prevMember.jerseyNumber);
            const replacerIsNewStarter = replacer !== undefined &&
              replacer.playerId !== playerId &&
              (prevMembers.get(replacer.playerId)?.jerseyNumber ?? 18) > 17;
            benched.push({
              playerId,
              playerName: currMember.playerName,
              teamCode,
              matchId,
              prevJersey: prevMember.jerseyNumber,
              prevPosition: prevMember.position,
              currentJersey: currMember.jerseyNumber,
              consecutiveRoundsBenched: await this.countConsecutiveBenchedRounds(
                year, round, teamCode, playerId
              ),
              replacedByPlayerId: replacerIsNewStarter ? replacer!.playerId : null,
              replacedByPlayerName: replacerIsNewStarter ? replacer!.playerName : null,
            });
          }
          continue;
        }

        // Priority 1: returning from own injury
        if (closedPlayerIds.has(String(playerId))) {
          const { lastJersey, lastPosition } = await this.findLastKnownPosition(
            year, round - 1, teamCode, playerId, currMember
          );
          returningFromInjury.push({
            playerId,
            playerName: currMember.playerName,
            teamCode,
            matchId,
            lastJersey,
            lastPosition,
            currentJersey: currMember.jerseyNumber,
            currentPosition: currMember.position,
            positionChanged: lastPosition.toLowerCase() !== currMember.position.toLowerCase(),
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

        // Priority 3: was a starter — position change or unchanged
        if (prevMember && wasStarter) {
          if (prevMember.position.toLowerCase() !== currMember.position.toLowerCase()) {
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

        // Priority 4: new to the 17 — check if they replaced a now-benched player
        const prevHolder = prevByJersey.get(currMember.jerseyNumber);
        const prevHolderNowBenched = prevHolder !== undefined &&
          (currentMembers.get(prevHolder.playerId)?.jerseyNumber ?? 0) > 17;
        promoted.push({
          playerId,
          playerName: currMember.playerName,
          teamCode,
          matchId,
          currentJersey: currMember.jerseyNumber,
          position: currMember.position,
          replacingPlayerId: prevHolderNowBenched ? prevHolder!.playerId : null,
          replacingPlayerName: prevHolderNowBenched ? prevHolder!.playerName : null,
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
      if (!member || member.jerseyNumber <= 17) break;
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
  ): Promise<{ lastJersey: number; lastPosition: string }> {
    for (let r = fromRound; r >= 1; r--) {
      const lists = await this.teamListRepo.findByYearAndRound(year, r);
      const list = lists.find(tl => tl.teamCode === teamCode);
      if (!list) continue;
      const member = list.members.find(m => m.playerId === playerId);
      if (member) return { lastJersey: member.jerseyNumber, lastPosition: member.position };
    }
    return { lastJersey: fallback.jerseyNumber, lastPosition: fallback.position };
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
