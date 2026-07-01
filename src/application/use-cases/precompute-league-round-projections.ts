/**
 * PrecomputeLeagueRoundProjectionsUseCase — batched precompute of the
 * league-round dashboard artifact for one `(year, round)`.
 *
 * Composes existing precomputed inputs (no live D1 work in the hot path):
 *   - D1 supplementary_stats              → top/bottom break-even rows
 *   - TeamRankingsAggregate (KV)          → composite & captaincy candidate pools
 *   - PlayerProjectionAggregate (KV)      → contextual adjustments per candidate
 *   - Round matches (D1)                  → per-team opponent + venue
 *
 * Idempotent at the watermark: same inputs → same payload (modulo computedAt).
 */

import type {
  LeagueRoundProjectionsArtifact,
  LeagueRoundProjectionsRepository,
  BreakEvenRow,
  BreakEvenSlices,
  ProjectionRow,
} from '../../domain/repositories/league-round-projections-repository.js';
import type { ProjectionRepository } from '../../domain/repositories/projection-repository.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { PlayerRepository } from '../../domain/repositories/player-repository.js';
import type { TeamListRepository } from '../../domain/repositories/team-list-repository.js';
import type { SupplementaryPlayerStats } from '../../domain/ports/supplementary-stats-source.js';
import type { ProjectionValues } from '../../analytics/contextual-projection-types.js';
import { applyMultipliers } from '../../analytics/contextual-projection-service.js';
import { VENUE_NORMALISATION } from '../../config/venue-normalisation.js';
import { logger } from '../../utils/logger.js';

const BREAK_EVEN_SLICE_SIZE = 100;
const PROJECTION_TOP_N = 100;
// 17 teams × 30 = 510 candidates per mode — comfortable headroom for top 100
// after dedupe and bye exclusion.
const CANDIDATE_POOL_PER_TEAM = 30;

/**
 * Normalise a player name for cross-source matching. The supplementary stats
 * source emits "Isaako, Jamayne" (Last, First) while team lists emit
 * "Jamayne Isaako" (First Last). Both collapse to "jamayne isaako" here so
 * a single lookup key works for either source.
 */
function normalisePlayerName(name: string): string {
  const trimmed = name.trim();
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx !== -1) {
    const last = trimmed.slice(0, commaIdx).trim();
    const first = trimmed.slice(commaIdx + 1).trim();
    return `${first} ${last}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

interface SupplementaryRepoLike {
  findByRound(season: number, round: number): Promise<SupplementaryPlayerStats[]>;
}

export interface PrecomputeLeagueRoundProjectionsDeps {
  leagueRoundProjectionsRepository: LeagueRoundProjectionsRepository;
  projectionRepository: ProjectionRepository;
  matchRepository: MatchRepository;
  playerRepository: PlayerRepository;
  supplementaryRepo: SupplementaryRepoLike;
  teamListRepository: TeamListRepository;
}

export interface PrecomputeLeagueRoundProjectionsInput {
  year: number;
  round: number;
  asOfRound: number;
}

interface RoundFixtureContext {
  readonly opponent: string;
  /** Raw nrl.com stadium string; canonicalised at lookup time via VENUE_NORMALISATION. */
  readonly stadium: string | null;
}

export class PrecomputeLeagueRoundProjectionsUseCase {
  constructor(private readonly deps: PrecomputeLeagueRoundProjectionsDeps) {}

  async execute(input: PrecomputeLeagueRoundProjectionsInput): Promise<void> {
    const { year, round, asOfRound } = input;

    // ── 1. Round fixtures (opponent + venue per team) ───────────────────────
    const matches = await this.deps.matchRepository.findByYearAndRound(year, round);
    const teamContext = new Map<string, RoundFixtureContext>();
    for (const m of matches) {
      if (m.homeTeamCode && m.awayTeamCode) {
        teamContext.set(m.homeTeamCode, { opponent: m.awayTeamCode, stadium: m.stadium });
        teamContext.set(m.awayTeamCode, { opponent: m.homeTeamCode, stadium: m.stadium });
      }
    }

    // ── 2. Named players for this round (from team lists) ──────────────────
    // Discovery (enqueue-due-scrapes §13) only emits this job after every
    // team has published its lineup, so we can treat the team lists as the
    // authoritative roster for the round. We build two views:
    //   • namedPlayerIds — Set<string> for fast id-based filtering of the
    //     projection candidate pool (candidate playerIds are strings, while
    //     SquadMember.playerId is number — coerce).
    //   • playerIdByNameTeam — name+team-keyed map for resolving break-even
    //     rows from the supplementary stats source, which only carries name
    //     and team (no playerId). The supp source uses "Last, First" while
    //     team lists use "First Last", so both are normalised through
    //     `normalisePlayerName` before keying.
    const teamLists = await this.deps.teamListRepository.findByYearAndRound(year, round);
    const namedPlayerIds = new Set<string>();
    const playerIdByNameTeam = new Map<string, string>();
    for (const list of teamLists) {
      for (const member of list.members) {
        const id = String(member.playerId);
        namedPlayerIds.add(id);
        playerIdByNameTeam.set(`${normalisePlayerName(member.playerName)}::${list.teamCode}`, id);
      }
    }

    // ── 3. Break-evens ──────────────────────────────────────────────────────
    // The artifact represents going INTO `round`, so we use the supplementary
    // stats published after the previous round (matching how nrl.com / SC
    // publish break-evens — they're calculated from the just-played round
    // and apply to the upcoming round's decisions). Round 1 has no prior
    // round, so it gets empty break-even slices.
    const breakEvens = round > 1
      ? await this.computeBreakEvens(year, round - 1, playerIdByNameTeam)
      : { top: [], bottom: [] };

    // ── 4. Candidate pools from precomputed team rankings ───────────────────
    const composite = await this.collectCandidates(year, 'composite', namedPlayerIds);
    const captaincy = await this.collectCandidates(year, 'captaincy', namedPlayerIds);

    // ── 5. Apply contextual adjustment, rank, slice ─────────────────────────
    const scorers = await this.rankWithContext(year, composite, teamContext, PROJECTION_TOP_N);
    const captains = await this.rankWithContext(year, captaincy, teamContext, PROJECTION_TOP_N);

    const artifact: LeagueRoundProjectionsArtifact = {
      year,
      round,
      asOfRound,
      computedAt: new Date().toISOString(),
      breakEvens,
      scorers,
      captains,
    };

    await this.deps.leagueRoundProjectionsRepository.save(artifact);

    logger.info('league-round-projections.precompute.completed', {
      year,
      round,
      asOfRound,
      breakEvensTop: breakEvens.top.length,
      breakEvensBottom: breakEvens.bottom.length,
      scorers: scorers.length,
      captains: captains.length,
    });
  }

  // ── Break-evens ───────────────────────────────────────────────────────────

  private async computeBreakEvens(
    year: number,
    round: number,
    namedPlayerIdByNameTeam: ReadonlyMap<string, string>,
  ): Promise<BreakEvenSlices> {
    const rows = await this.deps.supplementaryRepo.findByRound(year, round);

    const eligible: BreakEvenRow[] = [];
    for (const r of rows) {
      if (r.breakEven === null || r.price === null) continue;
      const teamCode = r.teamCode ?? '';
      // Resolving against the team-list map serves two purposes: it filters
      // to named-only players AND yields the canonical playerId. A miss
      // means the player isn't named for the upcoming round.
      const playerId = namedPlayerIdByNameTeam.get(
        `${normalisePlayerName(r.playerName)}::${teamCode}`,
      ) ?? null;
      if (playerId === null) continue;
      eligible.push({
        playerId,
        playerName: r.playerName,
        teamCode,
        scPosition: r.scPosition,
        price: r.price,
        breakEven: r.breakEven,
      });
    }

    const sortedDesc = [...eligible].sort((a, b) => b.breakEven - a.breakEven);
    const sortedAsc = [...eligible].sort((a, b) => a.breakEven - b.breakEven);

    return {
      top: sortedDesc.slice(0, BREAK_EVEN_SLICE_SIZE),
      bottom: sortedAsc.slice(0, BREAK_EVEN_SLICE_SIZE),
    };
  }

  // ── Candidate pool from precomputed team rankings ─────────────────────────

  private async collectCandidates(
    year: number,
    mode: 'composite' | 'captaincy',
    namedPlayerIds: ReadonlySet<string>,
  ): Promise<Array<{ playerId: string; baseScore: number }>> {
    // Pull every team-ranking aggregate we have for the year. The discovery
    // gate ensures all 17 teams are covered before this job runs; on miss
    // we silently skip (next discovery tick will re-emit).
    const coverage = await this.deps.projectionRepository.listTeamRankingsAsOfRounds(year);
    const teamCodes = new Set<string>();
    for (const key of coverage.keys()) {
      const [teamCode, m] = key.split(':');
      if (teamCode && m === mode) teamCodes.add(teamCode);
    }

    const aggregates = await Promise.all(
      [...teamCodes].map(teamCode =>
        this.deps.projectionRepository.findTeamRankingsAggregate(year, teamCode, mode),
      ),
    );

    const candidates: Array<{ playerId: string; baseScore: number }> = [];
    for (const agg of aggregates) {
      if (!agg) continue;
      const top = agg.rankings.rankedPlayers.slice(0, CANDIDATE_POOL_PER_TEAM);
      for (const p of top) {
        if (!namedPlayerIds.has(p.profile.playerId)) continue;
        candidates.push({
          playerId: p.profile.playerId,
          baseScore: p.compositeScore ?? 0,
        });
      }
    }
    return candidates;
  }

  // ── Apply contextual adjustment, sort, slice ──────────────────────────────

  private async rankWithContext(
    year: number,
    candidates: Array<{ playerId: string; baseScore: number }>,
    teamContext: Map<string, RoundFixtureContext>,
    topN: number,
  ): Promise<ProjectionRow[]> {
    // Resolve each player's contextual projection from the precomputed
    // PlayerProjectionAggregate. The aggregate carries every opponent/venue
    // multiplier already — we just slice the requested context.
    const settled = await Promise.all(
      candidates.map(async c => {
        const agg = await this.deps.projectionRepository.findPlayerAggregate(year, c.playerId);
        if (!agg) return null;
        const teamCode = agg.contextualProfile.teamCode;
        const ctx = teamContext.get(teamCode);
        if (!ctx) return null; // bye

        const base: ProjectionValues = {
          total: agg.baseProfile.projectedTotal,
          floor: agg.baseProfile.projectedFloor,
          ceiling: agg.baseProfile.projectedCeiling,
        };
        const multipliers: number[] = [];
        const opponentAdj = agg.contextualProfile.opponents[ctx.opponent];
        if (opponentAdj) multipliers.push(opponentAdj.multiplier);

        const venueId = ctx.stadium ? VENUE_NORMALISATION[ctx.stadium] ?? null : null;
        if (venueId) {
          const venueAdj = agg.contextualProfile.venues[venueId];
          if (venueAdj) multipliers.push(venueAdj.multiplier);
        }
        const adjusted = applyMultipliers(base, multipliers);

        return {
          playerId: agg.contextualProfile.playerId,
          playerName: agg.contextualProfile.playerName,
          teamCode,
          position: agg.contextualProfile.position,
          opponent: ctx.opponent,
          venue: venueId,
          baseTotal: base.total,
          adjustedTotal: adjusted.total,
          adjustedFloor: adjusted.floor,
          adjustedCeiling: adjusted.ceiling,
        };
      }),
    );

    const rows = settled.filter((r): r is Omit<ProjectionRow, 'rank'> => r !== null);

    // Dedupe by playerId — composite and captaincy modes can pull the same
    // player into both pools, but within one pool each team's ranked list is
    // already de-duped. Defensive only.
    const seen = new Set<string>();
    const deduped = rows.filter(r => {
      if (seen.has(r.playerId)) return false;
      seen.add(r.playerId);
      return true;
    });

    deduped.sort((a, b) => b.adjustedTotal - a.adjustedTotal);
    return deduped.slice(0, topN).map((r, i) => ({ ...r, rank: i + 1 }));
  }
}
