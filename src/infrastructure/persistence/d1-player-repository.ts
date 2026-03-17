/**
 * D1PlayerRepository — implements PlayerRepository using Cloudflare D1.
 * Provides persistent storage for Player aggregates and MatchPerformance records.
 */

import type { PlayerRepository, SeasonAggregates, PlayerSeasonSummary } from '../../domain/repositories/player-repository.js';
import type { Player, MatchPerformance } from '../../domain/player.js';

export class D1PlayerRepository implements PlayerRepository {
  constructor(private readonly db: D1Database) {}

  async save(player: Player): Promise<void> {
    const statements: D1PreparedStatement[] = [];

    // Upsert player
    statements.push(
      this.db
        .prepare(
          `INSERT INTO players (id, name, date_of_birth, team_code, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             team_code = excluded.team_code,
             position = excluded.position,
             updated_at = datetime('now')`
        )
        .bind(player.id, player.name, player.dateOfBirth, player.teamCode, player.position)
    );

    // Upsert each match performance
    for (const perf of player.performances) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO match_performances (player_id, match_id, season, round, team_code, 
             all_run_metres,
             all_runs,
             bomb_kicks,
             cross_field_kicks,
             conversions,
             conversion_attempts,
             dummy_half_runs,
             dummy_half_run_metres,
             dummy_passes,
             errors,
             fantasy_points_total,
             field_goals,
             forced_drop_out_kicks,
             forty_twenty_kicks,
             goals,
             goal_conversion_rate,
             grubber_kicks,
             handling_errors,
             hit_ups,
             hit_up_run_metres,
             ineffective_tackles,
             intercepts,
             kicks,
             kicks_dead,
             kicks_defused,
             kick_metres,
             kick_return_metres,
             line_break_assists,
             line_breaks,
             line_engaged_runs,
             minutes_played,
             missed_tackles,
             offloads,
             offside_within_ten_metres,
             one_on_one_lost,
             one_on_one_steal,
             one_point_field_goals,
             on_report,
             passes_to_run_ratio,
             passes,
             play_the_ball_total,
             play_the_ball_average_speed,
             penalties,
             points,
             penalty_goals,
             post_contact_metres,
             receipts,
             ruck_infringements,
             send_offs,
             sin_bins,
             stint_one,
             tackle_breaks,
             tackle_efficiency,
             tackles_made,
             tries,
             try_assists,
             twenty_forty_kicks,
             two_point_field_goals,
             is_complete, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             ON CONFLICT(player_id, match_id) DO UPDATE SET
               all_run_metres = excluded.all_run_metres,
               all_runs = excluded.all_runs,
               bomb_kicks = excluded.bomb_kicks,
               cross_field_kicks = excluded.cross_field_kicks,
               conversions = excluded.conversions,
               conversion_attempts = excluded.conversion_attempts,
               dummy_half_runs = excluded.dummy_half_runs,
               dummy_half_run_metres = excluded.dummy_half_run_metres,
               dummy_passes = excluded.dummy_passes,
               errors = excluded.errors,
               fantasy_points_total = excluded.fantasy_points_total,
               field_goals = excluded.field_goals,
               forced_drop_out_kicks = excluded.forced_drop_out_kicks,
               forty_twenty_kicks = excluded.forty_twenty_kicks,
               goals = excluded.goals,
               goal_conversion_rate = excluded.goal_conversion_rate,
               grubber_kicks = excluded.grubber_kicks,
               handling_errors = excluded.handling_errors,
               hit_ups = excluded.hit_ups,
               hit_up_run_metres = excluded.hit_up_run_metres,
               ineffective_tackles = excluded.ineffective_tackles,
               intercepts = excluded.intercepts,
               kicks = excluded.kicks,
               kicks_dead = excluded.kicks_dead,
               kicks_defused = excluded.kicks_defused,
               kick_metres = excluded.kick_metres,
               kick_return_metres = excluded.kick_return_metres,
               line_break_assists = excluded.line_break_assists,
               line_breaks = excluded.line_breaks,
               line_engaged_runs = excluded.line_engaged_runs,
               minutes_played = excluded.minutes_played,
               missed_tackles = excluded.missed_tackles,
               offloads = excluded.offloads,
               offside_within_ten_metres = excluded.offside_within_ten_metres,
               one_on_one_lost = excluded.one_on_one_lost,
               one_on_one_steal = excluded.one_on_one_steal,
               one_point_field_goals = excluded.one_point_field_goals,
               on_report = excluded.on_report,
               passes_to_run_ratio = excluded.passes_to_run_ratio,
               passes = excluded.passes,
               play_the_ball_total = excluded.play_the_ball_total,
               play_the_ball_average_speed = excluded.play_the_ball_average_speed,
               penalties = excluded.penalties,
               points = excluded.points,
               penalty_goals = excluded.penalty_goals,
               post_contact_metres = excluded.post_contact_metres,
               receipts = excluded.receipts,
               ruck_infringements = excluded.ruck_infringements,
               send_offs = excluded.send_offs,
               sin_bins = excluded.sin_bins,
               stint_one = excluded.stint_one,
               tackle_breaks = excluded.tackle_breaks,
               tackle_efficiency = excluded.tackle_efficiency,
               tackles_made = excluded.tackles_made,
               tries = excluded.tries,
               try_assists = excluded.try_assists,
               twenty_forty_kicks = excluded.twenty_forty_kicks,
               two_point_field_goals = excluded.two_point_field_goals,
               is_complete = excluded.is_complete,
               updated_at = datetime('now')
             WHERE excluded.is_complete = 1 OR match_performances.is_complete = 0`
          )
          .bind(
            player.id,
            perf.matchId,
            perf.year,
            perf.round,
            perf.teamCode,
            perf.allRunMetres,
            perf.allRuns,
            perf.bombKicks,
            perf.crossFieldKicks,
            perf.conversions,
            perf.conversionAttempts,
            perf.dummyHalfRuns,
            perf.dummyHalfRunMetres,
            perf.dummyPasses,
            perf.errors,
            perf.fantasyPointsTotal,
            perf.fieldGoals,
            perf.forcedDropOutKicks,
            perf.fortyTwentyKicks,
            perf.goals,
            perf.goalConversionRate,
            perf.grubberKicks,
            perf.handlingErrors,
            perf.hitUps,
            perf.hitUpRunMetres,
            perf.ineffectiveTackles,
            perf.intercepts,
            perf.kicks,
            perf.kicksDead,
            perf.kicksDefused,
            perf.kickMetres,
            perf.kickReturnMetres,
            perf.lineBreakAssists,
            perf.lineBreaks,
            perf.lineEngagedRuns,
            perf.minutesPlayed,
            perf.missedTackles,
            perf.offloads,
            perf.offsideWithinTenMetres,
            perf.oneOnOneLost,
            perf.oneOnOneSteal,
            perf.onePointFieldGoals,
            perf.onReport,
            perf.passesToRunRatio,
            perf.passes,
            perf.playTheBallTotal,
            perf.playTheBallAverageSpeed,
            perf.penalties,
            perf.points,
            perf.penaltyGoals,
            perf.postContactMetres,
            perf.receipts,
            perf.ruckInfringements,
            perf.sendOffs,
            perf.sinBins,
            perf.stintOne,
            perf.tackleBreaks,
            perf.tackleEfficiency,
            perf.tacklesMade,
            perf.tries,
            perf.tryAssists,
            perf.twentyFortyKicks,
            perf.twoPointFieldGoals,
            perf.isComplete ? 1 : 0
          )
      );
    }

    await this.db.batch(statements);
  }

  async findById(id: string): Promise<Player | null> {
    const playerRow = await this.db
      .prepare('SELECT id, name, date_of_birth, team_code, position FROM players WHERE id = ?')
      .bind(id)
      .first<{ id: string; name: string; date_of_birth: string | null; team_code: string; position: string }>();

    if (!playerRow) return null;

    const perfResults = await this.db
      .prepare(
        `SELECT match_id, season, round, team_code, 
          all_run_metres,
          all_runs,
          bomb_kicks,
          cross_field_kicks,
          conversions,
          conversion_attempts,
          dummy_half_runs,
          dummy_half_run_metres,
          dummy_passes,
          errors,
          fantasy_points_total,
          field_goals,
          forced_drop_out_kicks,
          forty_twenty_kicks,
          goals,
          goal_conversion_rate,
          grubber_kicks,
          handling_errors,
          hit_ups,
          hit_up_run_metres,
          ineffective_tackles,
          intercepts,
          kicks,
          kicks_dead,
          kicks_defused,
          kick_metres,
          kick_return_metres,
          line_break_assists,
          line_breaks,
          line_engaged_runs,
          minutes_played,
          missed_tackles,
          offloads,
          offside_within_ten_metres,
          one_on_one_lost,
          one_on_one_steal,
          one_point_field_goals,
          on_report,
          passes_to_run_ratio,
          passes,
          play_the_ball_total,
          play_the_ball_average_speed,
          penalties,
          points,
          penalty_goals,
          post_contact_metres,
          receipts,
          ruck_infringements,
          send_offs,
          sin_bins,
          stint_one,
          tackle_breaks,
          tackle_efficiency,
          tackles_made,
          tries,
          try_assists,
          twenty_forty_kicks,
          two_point_field_goals,
          is_complete
         FROM match_performances WHERE player_id = ? ORDER BY season, round`
      )
      .bind(id)
      .all<{
        match_id: string; season: number; round: number; team_code: string;
        all_run_metres: number;
        all_runs: number;
        bomb_kicks: number;
        cross_field_kicks: number;
        conversions: number;
        conversion_attempts: number;
        dummy_half_runs: number;
        dummy_half_run_metres: number;
        dummy_passes: number;
        errors: number;
        fantasy_points_total: number;
        field_goals: number;
        forced_drop_out_kicks: number;
        forty_twenty_kicks: number;
        goals: number;
        goal_conversion_rate: number;
        grubber_kicks: number;
        handling_errors: number;
        hit_ups: number;
        hit_up_run_metres: number;
        ineffective_tackles: number;
        intercepts: number;
        kicks: number;
        kicks_dead: number;
        kicks_defused: number;
        kick_metres: number;
        kick_return_metres: number;
        line_break_assists: number;
        line_breaks: number;
        line_engaged_runs: number;
        minutes_played: number;
        missed_tackles: number;
        offloads: number;
        offside_within_ten_metres: number;
        one_on_one_lost: number;
        one_on_one_steal: number;
        one_point_field_goals: number;
        on_report: number;
        passes_to_run_ratio: number;
        passes: number;
        play_the_ball_total: number;
        play_the_ball_average_speed: number;
        penalties: number;
        points: number;
        penalty_goals: number;
        post_contact_metres: number;
        receipts: number;
        ruck_infringements: number;
        send_offs: number;
        sin_bins: number;
        stint_one: number;
        tackle_breaks: number;
        tackle_efficiency: number;
        tackles_made: number;
        tries: number;
        try_assists: number;
        twenty_forty_kicks: number;
        two_point_field_goals: number;
        is_complete: number;
      }>();

    const performances: MatchPerformance[] = (perfResults.results ?? []).map(row => ({
      matchId: row.match_id,
      year: row.season,
      round: row.round,
      teamCode: row.team_code,
      allRunMetres: row.all_run_metres,
      allRuns: row.all_runs,
      bombKicks: row.bomb_kicks,
      crossFieldKicks: row.cross_field_kicks,
      conversions: row.conversions,
      conversionAttempts: row.conversion_attempts,
      dummyHalfRuns: row.dummy_half_runs,
      dummyHalfRunMetres: row.dummy_half_run_metres,
      dummyPasses: row.dummy_passes,
      errors: row.errors,
      fantasyPointsTotal: row.fantasy_points_total,
      fieldGoals: row.field_goals,
      forcedDropOutKicks: row.forced_drop_out_kicks,
      fortyTwentyKicks: row.forty_twenty_kicks,
      goals: row.goals,
      goalConversionRate: row.goal_conversion_rate,
      grubberKicks: row.grubber_kicks,
      handlingErrors: row.handling_errors,
      hitUps: row.hit_ups,
      hitUpRunMetres: row.hit_up_run_metres,
      ineffectiveTackles: row.ineffective_tackles,
      intercepts: row.intercepts,
      kicks: row.kicks,
      kicksDead: row.kicks_dead,
      kicksDefused: row.kicks_defused,
      kickMetres: row.kick_metres,
      kickReturnMetres: row.kick_return_metres,
      lineBreakAssists: row.line_break_assists,
      lineBreaks: row.line_breaks,
      lineEngagedRuns: row.line_engaged_runs,
      minutesPlayed: row.minutes_played,
      missedTackles: row.missed_tackles,
      offloads: row.offloads,
      offsideWithinTenMetres: row.offside_within_ten_metres,
      oneOnOneLost: row.one_on_one_lost,
      oneOnOneSteal: row.one_on_one_steal,
      onePointFieldGoals: row.one_point_field_goals,
      onReport: row.on_report,
      passesToRunRatio: row.passes_to_run_ratio,
      passes: row.passes,
      playTheBallTotal: row.play_the_ball_total,
      playTheBallAverageSpeed: row.play_the_ball_average_speed,
      penalties: row.penalties,
      points: row.points,
      penaltyGoals: row.penalty_goals,
      postContactMetres: row.post_contact_metres,
      receipts: row.receipts,
      ruckInfringements: row.ruck_infringements,
      sendOffs: row.send_offs,
      sinBins: row.sin_bins,
      stintOne: row.stint_one,
      tackleBreaks: row.tackle_breaks,
      tackleEfficiency: row.tackle_efficiency,
      tacklesMade: row.tackles_made,
      tries: row.tries,
      tryAssists: row.try_assists,
      twentyFortyKicks: row.twenty_forty_kicks,
      twoPointFieldGoals: row.two_point_field_goals,
      isComplete: row.is_complete === 1,
    }));

    return {
      id: playerRow.id,
      name: playerRow.name,
      dateOfBirth: playerRow.date_of_birth,
      teamCode: playerRow.team_code,
      position: playerRow.position,
      performances,
    };
  }

  async findByTeam(teamCode: string, season?: number): Promise<Player[]> {
    let playerIds: string[];

    if (season !== undefined) {
      // Find players who have performances for this team in this season
      const result = await this.db
        .prepare(
          'SELECT DISTINCT player_id FROM match_performances WHERE team_code = ? AND season = ?'
        )
        .bind(teamCode, season)
        .all<{ player_id: string }>();
      playerIds = (result.results ?? []).map(r => r.player_id);
    } else {
      // Find players currently on this team
      const result = await this.db
        .prepare('SELECT id FROM players WHERE team_code = ?')
        .bind(teamCode)
        .all<{ id: string }>();
      playerIds = (result.results ?? []).map(r => r.id);
    }

    const players: Player[] = [];
    for (const id of playerIds) {
      const player = await this.findById(id);
      if (player) {
        if (season !== undefined) {
          // Filter performances to requested season only
          const filtered: Player = {
            ...player,
            performances: player.performances.filter(p => p.year === season),
          };
          players.push(filtered);
        } else {
          players.push(player);
        }
      }
    }

    return players;
  }

  async findMatchPerformances(playerId: string, season: number): Promise<MatchPerformance[]> {
    const result = await this.db
      .prepare(
        `SELECT match_id, season, round, team_code, 
         all_run_metres,
         all_runs,
         bomb_kicks,
         cross_field_kicks,
         conversions,
         conversion_attempts,
         dummy_half_runs,
         dummy_half_run_metres,
         dummy_passes,
         errors,
         fantasy_points_total,
         field_goals,
         forced_drop_out_kicks,
         forty_twenty_kicks,
         goals,
         goal_conversion_rate,
         grubber_kicks,
         handling_errors,
         hit_ups,
         hit_up_run_metres,
         ineffective_tackles,
         intercepts,
         kicks,
         kicks_dead,
         kicks_defused,
         kick_metres,
         kick_return_metres,
         line_break_assists,
         line_breaks,
         line_engaged_runs,
         minutes_played,
         missed_tackles,
         offloads,
         offside_within_ten_metres,
         one_on_one_lost,
         one_on_one_steal,
         one_point_field_goals,
         on_report,
         passes_to_run_ratio,
         passes,
         play_the_ball_total,
         play_the_ball_average_speed,
         penalties,
         points,
         penalty_goals,
         post_contact_metres,
         receipts,
         ruck_infringements,
         send_offs,
         sin_bins,
         stint_one,
         tackle_breaks,
         tackle_efficiency,
         tackles_made,
         tries,
         try_assists,
         twenty_forty_kicks,
         two_point_field_goals,
         is_complete
         FROM match_performances WHERE player_id = ? AND season = ? ORDER BY round`
      )
      .bind(playerId, season)
      .all<{
        match_id: string; season: number; round: number; team_code: string;
        all_run_metres: number;
        all_runs: number;
        bomb_kicks: number;
        cross_field_kicks: number;
        conversions: number;
        conversion_attempts: number;
        dummy_half_runs: number;
        dummy_half_run_metres: number;
        dummy_passes: number;
        errors: number;
        fantasy_points_total: number;
        field_goals: number;
        forced_drop_out_kicks: number;
        forty_twenty_kicks: number;
        goals: number;
        goal_conversion_rate: number;
        grubber_kicks: number;
        handling_errors: number;
        hit_ups: number;
        hit_up_run_metres: number;
        ineffective_tackles: number;
        intercepts: number;
        kicks: number;
        kicks_dead: number;
        kicks_defused: number;
        kick_metres: number;
        kick_return_metres: number;
        line_break_assists: number;
        line_breaks: number;
        line_engaged_runs: number;
        minutes_played: number;
        missed_tackles: number;
        offloads: number;
        offside_within_ten_metres: number;
        one_on_one_lost: number;
        one_on_one_steal: number;
        one_point_field_goals: number;
        on_report: number;
        passes_to_run_ratio: number;
        passes: number;
        play_the_ball_total: number;
        play_the_ball_average_speed: number;
        penalties: number;
        points: number;
        penalty_goals: number;
        post_contact_metres: number;
        receipts: number;
        ruck_infringements: number;
        send_offs: number;
        sin_bins: number;
        stint_one: number;
        tackle_breaks: number;
        tackle_efficiency: number;
        tackles_made: number;
        tries: number;
        try_assists: number;
        twenty_forty_kicks: number;
        two_point_field_goals: number;
        is_complete: number;
      }>();

    return (result.results ?? []).map(row => ({
      matchId: row.match_id,
      year: row.season,
      round: row.round,
      teamCode: row.team_code,
      allRunMetres: row.all_run_metres,
      allRuns: row.all_runs,
      bombKicks: row.bomb_kicks,
      crossFieldKicks: row.cross_field_kicks,
      conversions: row.conversions,
      conversionAttempts: row.conversion_attempts,
      dummyHalfRuns: row.dummy_half_runs,
      dummyHalfRunMetres: row.dummy_half_run_metres,
      dummyPasses: row.dummy_passes,
      errors: row.errors,
      fantasyPointsTotal: row.fantasy_points_total,
      fieldGoals: row.field_goals,
      forcedDropOutKicks: row.forced_drop_out_kicks,
      fortyTwentyKicks: row.forty_twenty_kicks,
      goals: row.goals,
      goalConversionRate: row.goal_conversion_rate,
      grubberKicks: row.grubber_kicks,
      handlingErrors: row.handling_errors,
      hitUps: row.hit_ups,
      hitUpRunMetres: row.hit_up_run_metres,
      ineffectiveTackles: row.ineffective_tackles,
      intercepts: row.intercepts,
      kicks: row.kicks,
      kicksDead: row.kicks_dead,
      kicksDefused: row.kicks_defused,
      kickMetres: row.kick_metres,
      kickReturnMetres: row.kick_return_metres,
      lineBreakAssists: row.line_break_assists,
      lineBreaks: row.line_breaks,
      lineEngagedRuns: row.line_engaged_runs,
      minutesPlayed: row.minutes_played,
      missedTackles: row.missed_tackles,
      offloads: row.offloads,
      offsideWithinTenMetres: row.offside_within_ten_metres,
      oneOnOneLost: row.one_on_one_lost,
      oneOnOneSteal: row.one_on_one_steal,
      onePointFieldGoals: row.one_point_field_goals,
      onReport: row.on_report,
      passesToRunRatio: row.passes_to_run_ratio,
      passes: row.passes,
      playTheBallTotal: row.play_the_ball_total,
      playTheBallAverageSpeed: row.play_the_ball_average_speed,
      penalties: row.penalties,
      points: row.points,
      penaltyGoals: row.penalty_goals,
      postContactMetres: row.post_contact_metres,
      receipts: row.receipts,
      ruckInfringements: row.ruck_infringements,
      sendOffs: row.send_offs,
      sinBins: row.sin_bins,
      stintOne: row.stint_one,
      tackleBreaks: row.tackle_breaks,
      tackleEfficiency: row.tackle_efficiency,
      tacklesMade: row.tackles_made,
      tries: row.tries,
      tryAssists: row.try_assists,
      twentyFortyKicks: row.twenty_forty_kicks,
      twoPointFieldGoals: row.two_point_field_goals,
      isComplete: row.is_complete === 1,
    }));
  }

  async findSeasonAggregates(playerId: string, season: number): Promise<SeasonAggregates | null> {
    const row = await this.db
      .prepare(
        `SELECT
           COUNT(*) as matches_played,
           SUM(all_run_metres) as total_all_run_metres,
           SUM(all_runs) as total_all_runs,
           SUM(bomb_kicks) as total_bomb_kicks,
           SUM(cross_field_kicks) as total_cross_field_kicks,
           SUM(conversions) as total_conversions,
           SUM(conversion_attempts) as total_conversion_attempts,
           SUM(dummy_half_runs) as total_dummy_half_runs,
           SUM(dummy_half_run_metres) as total_dummy_half_run_metres,
           SUM(dummy_passes) as total_dummy_passes,
           SUM(errors) as total_errors,
           SUM(fantasy_points_total) as total_fantasy_points_total,
           SUM(field_goals) as total_field_goals,
           SUM(forced_drop_out_kicks) as total_forced_drop_out_kicks,
           SUM(forty_twenty_kicks) as total_forty_twenty_kicks,
           SUM(goals) as total_goals,
           SUM(goal_conversion_rate) as total_goal_conversion_rate,
           SUM(grubber_kicks) as total_grubber_kicks,
           SUM(handling_errors) as total_handling_errors,
           SUM(hit_ups) as total_hit_ups,
           SUM(hit_up_run_metres) as total_hit_up_run_metres,
           SUM(ineffective_tackles) as total_ineffective_tackles,
           SUM(intercepts) as total_intercepts,
           SUM(kicks) as total_kicks,
           SUM(kicks_dead) as total_kicks_dead,
           SUM(kicks_defused) as total_kicks_defused,
           SUM(kick_metres) as total_kick_metres,
           SUM(kick_return_metres) as total_kick_return_metres,
           SUM(line_break_assists) as total_line_break_assists,
           SUM(line_breaks) as total_line_breaks,
           SUM(line_engaged_runs) as total_line_engaged_runs,
           SUM(minutes_played) as total_minutes_played,
           SUM(missed_tackles) as total_missed_tackles,
           SUM(offloads) as total_offloads,
           SUM(offside_within_ten_metres) as total_offside_within_ten_metres,
           SUM(one_on_one_lost) as total_one_on_one_lost,
           SUM(one_on_one_steal) as total_one_on_one_steal,
           SUM(one_point_field_goals) as total_one_point_field_goals,
           SUM(on_report) as total_on_report,
           SUM(passes_to_run_ratio) as total_passes_to_run_ratio,
           SUM(passes) as total_passes,
           SUM(play_the_ball_total) as total_play_the_ball_total,
           SUM(play_the_ball_average_speed) as total_play_the_ball_average_speed,
           SUM(penalties) as total_penalties,
           SUM(points) as total_points,
           SUM(penalty_goals) as total_penalty_goals,
           SUM(post_contact_metres) as total_post_contact_metres,
           SUM(receipts) as total_receipts,
           SUM(ruck_infringements) as total_ruck_infringements,
           SUM(send_offs) as total_send_offs,
           SUM(sin_bins) as total_sin_bins,
           SUM(stint_one) as total_stint_one,
           SUM(tackle_breaks) as total_tackle_breaks,
           SUM(tackle_efficiency) as total_tackle_efficiency,
           SUM(tackles_made) as total_tackles_made,
           SUM(tries) as total_tries,
           SUM(try_assists) as total_try_assists,
           SUM(twenty_forty_kicks) as total_twenty_forty_kicks,
           SUM(two_point_field_goals) as total_two_point_field_goals
         FROM match_performances
         WHERE player_id = ? AND season = ?`
      )
      .bind(playerId, season)
      .first<{
        matches_played: number; total_tries: number; total_goals: number;
        total_tackles_made: number; total_all_run_metres: number; total_fantasy_points_total: number;
      }>();

    if (!row || row.matches_played === 0) return null;

    return {
      matchesPlayed: row.matches_played,
      totalTries: row.total_tries,
      totalGoals: row.total_goals,
      totalTackles: row.total_tackles_made,
      totalRunMetres: row.total_all_run_metres,
      totalFantasyPoints: row.total_fantasy_points_total,
    };
  }

  async findPerformancesByMatch(
    year: number,
    round: number,
    teamCode: string
  ): Promise<Array<{ playerName: string; position: string; playerId: string; performance: MatchPerformance }>> {
    const result = await this.db
      .prepare(
        `SELECT p.id AS player_id, p.name, p.position,
          mp.match_id, mp.season, mp.round, mp.team_code,
          mp.all_run_metres, mp.all_runs, mp.bomb_kicks, mp.cross_field_kicks,
          mp.conversions, mp.conversion_attempts, mp.dummy_half_runs, mp.dummy_half_run_metres,
          mp.dummy_passes, mp.errors, mp.fantasy_points_total, mp.field_goals,
          mp.forced_drop_out_kicks, mp.forty_twenty_kicks, mp.goals, mp.goal_conversion_rate,
          mp.grubber_kicks, mp.handling_errors, mp.hit_ups, mp.hit_up_run_metres,
          mp.ineffective_tackles, mp.intercepts, mp.kicks, mp.kicks_dead, mp.kicks_defused,
          mp.kick_metres, mp.kick_return_metres, mp.line_break_assists, mp.line_breaks,
          mp.line_engaged_runs, mp.minutes_played, mp.missed_tackles, mp.offloads,
          mp.offside_within_ten_metres, mp.one_on_one_lost, mp.one_on_one_steal,
          mp.one_point_field_goals, mp.on_report, mp.passes_to_run_ratio, mp.passes,
          mp.play_the_ball_total, mp.play_the_ball_average_speed, mp.penalties, mp.points,
          mp.penalty_goals, mp.post_contact_metres, mp.receipts, mp.ruck_infringements,
          mp.send_offs, mp.sin_bins, mp.stint_one, mp.tackle_breaks, mp.tackle_efficiency,
          mp.tackles_made, mp.tries, mp.try_assists, mp.twenty_forty_kicks,
          mp.two_point_field_goals, mp.is_complete
         FROM match_performances mp
         JOIN players p ON p.id = mp.player_id
         WHERE mp.season = ? AND mp.round = ? AND mp.team_code = ?
         ORDER BY mp.minutes_played DESC`
      )
      .bind(year, round, teamCode)
      .all<{
        player_id: string; name: string; position: string;
        match_id: string; season: number; round: number; team_code: string;
        all_run_metres: number; all_runs: number; bomb_kicks: number; cross_field_kicks: number;
        conversions: number; conversion_attempts: number; dummy_half_runs: number;
        dummy_half_run_metres: number; dummy_passes: number; errors: number;
        fantasy_points_total: number; field_goals: number; forced_drop_out_kicks: number;
        forty_twenty_kicks: number; goals: number; goal_conversion_rate: number;
        grubber_kicks: number; handling_errors: number; hit_ups: number; hit_up_run_metres: number;
        ineffective_tackles: number; intercepts: number; kicks: number; kicks_dead: number;
        kicks_defused: number; kick_metres: number; kick_return_metres: number;
        line_break_assists: number; line_breaks: number; line_engaged_runs: number;
        minutes_played: number; missed_tackles: number; offloads: number;
        offside_within_ten_metres: number; one_on_one_lost: number; one_on_one_steal: number;
        one_point_field_goals: number; on_report: number; passes_to_run_ratio: number;
        passes: number; play_the_ball_total: number; play_the_ball_average_speed: number;
        penalties: number; points: number; penalty_goals: number; post_contact_metres: number;
        receipts: number; ruck_infringements: number; send_offs: number; sin_bins: number;
        stint_one: number; tackle_breaks: number; tackle_efficiency: number;
        tackles_made: number; tries: number; try_assists: number; twenty_forty_kicks: number;
        two_point_field_goals: number; is_complete: number;
      }>();

    return (result.results ?? []).map(row => ({
      playerId: row.player_id,
      playerName: row.name,
      position: row.position,
      performance: {
        matchId: row.match_id,
        year: row.season,
        round: row.round,
        teamCode: row.team_code,
        allRunMetres: row.all_run_metres,
        allRuns: row.all_runs,
        bombKicks: row.bomb_kicks,
        crossFieldKicks: row.cross_field_kicks,
        conversions: row.conversions,
        conversionAttempts: row.conversion_attempts,
        dummyHalfRuns: row.dummy_half_runs,
        dummyHalfRunMetres: row.dummy_half_run_metres,
        dummyPasses: row.dummy_passes,
        errors: row.errors,
        fantasyPointsTotal: row.fantasy_points_total,
        fieldGoals: row.field_goals,
        forcedDropOutKicks: row.forced_drop_out_kicks,
        fortyTwentyKicks: row.forty_twenty_kicks,
        goals: row.goals,
        goalConversionRate: row.goal_conversion_rate,
        grubberKicks: row.grubber_kicks,
        handlingErrors: row.handling_errors,
        hitUps: row.hit_ups,
        hitUpRunMetres: row.hit_up_run_metres,
        ineffectiveTackles: row.ineffective_tackles,
        intercepts: row.intercepts,
        kicks: row.kicks,
        kicksDead: row.kicks_dead,
        kicksDefused: row.kicks_defused,
        kickMetres: row.kick_metres,
        kickReturnMetres: row.kick_return_metres,
        lineBreakAssists: row.line_break_assists,
        lineBreaks: row.line_breaks,
        lineEngagedRuns: row.line_engaged_runs,
        minutesPlayed: row.minutes_played,
        missedTackles: row.missed_tackles,
        offloads: row.offloads,
        offsideWithinTenMetres: row.offside_within_ten_metres,
        oneOnOneLost: row.one_on_one_lost,
        oneOnOneSteal: row.one_on_one_steal,
        onePointFieldGoals: row.one_point_field_goals,
        onReport: row.on_report,
        passesToRunRatio: row.passes_to_run_ratio,
        passes: row.passes,
        playTheBallTotal: row.play_the_ball_total,
        playTheBallAverageSpeed: row.play_the_ball_average_speed,
        penalties: row.penalties,
        points: row.points,
        penaltyGoals: row.penalty_goals,
        postContactMetres: row.post_contact_metres,
        receipts: row.receipts,
        ruckInfringements: row.ruck_infringements,
        sendOffs: row.send_offs,
        sinBins: row.sin_bins,
        stintOne: row.stint_one,
        tackleBreaks: row.tackle_breaks,
        tackleEfficiency: row.tackle_efficiency,
        tacklesMade: row.tackles_made,
        tries: row.tries,
        tryAssists: row.try_assists,
        twentyFortyKicks: row.twenty_forty_kicks,
        twoPointFieldGoals: row.two_point_field_goals,
        isComplete: row.is_complete === 1,
      },
    }));
  }

  async isRoundComplete(season: number, round: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) as total, SUM(CASE WHEN is_complete = 1 THEN 1 ELSE 0 END) as complete
         FROM match_performances WHERE season = ? AND round = ?`
      )
      .bind(season, round)
      .first<{ total: number; complete: number }>();

    if (!row || row.total === 0) return false;
    return row.total === row.complete;
  }

  async countDistinctMatchesInRound(season: number, round: number): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(DISTINCT match_id) as match_count
         FROM match_performances WHERE season = ? AND round = ?`
      )
      .bind(season, round)
      .first<{ match_count: number }>();

    return row?.match_count ?? 0;
  }

  async findAllSeasonSummaries(season: number): Promise<PlayerSeasonSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT
          p.id AS player_id,
          p.name AS player_name,
          p.position,
          (SELECT mp2.team_code FROM match_performances mp2
           WHERE mp2.player_id = p.id AND mp2.season = ?
           ORDER BY mp2.round DESC LIMIT 1) AS team_code,
          COUNT(*) AS games_played,
          SUM(mp.tries) AS total_tries,
          SUM(mp.all_run_metres) AS total_run_metres,
          SUM(mp.tackles_made) AS total_tackles_made,
          SUM(mp.points) AS total_points,
          AVG(mp.fantasy_points_total) AS average_fantasy_points,
          SUM(mp.tackle_breaks) AS total_tackle_breaks,
          SUM(mp.line_breaks) AS total_line_breaks
        FROM match_performances mp
        JOIN players p ON p.id = mp.player_id
        WHERE mp.season = ?
        GROUP BY mp.player_id
        ORDER BY p.name`
      )
      .bind(season, season)
      .all<{
        player_id: string;
        player_name: string;
        position: string;
        team_code: string;
        games_played: number;
        total_tries: number;
        total_run_metres: number;
        total_tackles_made: number;
        total_points: number;
        average_fantasy_points: number;
        total_tackle_breaks: number;
        total_line_breaks: number;
      }>();

    return (result.results ?? []).map(row => ({
      playerId: row.player_id,
      playerName: row.player_name,
      teamCode: row.team_code,
      position: row.position,
      gamesPlayed: row.games_played,
      totalTries: row.total_tries,
      totalRunMetres: row.total_run_metres,
      totalTacklesMade: row.total_tackles_made,
      totalPoints: row.total_points,
      averageFantasyPoints: row.average_fantasy_points,
      totalTackleBreaks: row.total_tackle_breaks,
      totalLineBreaks: row.total_line_breaks,
    }));
  }
}
