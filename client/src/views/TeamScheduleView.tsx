import { Box, CircularProgress, Alert } from '@mui/material';
import { TeamSelector } from '../components/TeamSelector';
import { TeamScheduleSummary } from '../components/TeamScheduleSummary';
import { FixtureTable } from '../components/FixtureTable';
import { FilterControls } from '../components/FilterControls';
import type {
  Team,
  TeamScheduleResponse,
  FilterState,
  ScheduleFixture,
  AllTeamsRankingResponse,
  Streak,
} from '../types';
import type { FormTrajectoryResponse } from '../services/api';

interface TeamScheduleViewProps {
  teams: Team[];
  selectedTeamCode: string | null;
  onTeamSelect: (code: string) => void;
  schedule: TeamScheduleResponse | null;
  loading: boolean;
  error: string | null;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  /** Rankings data for all teams */
  rankings?: AllTeamsRankingResponse | null;
  /** Streak analysis data for selected team */
  streaks?: Streak[];
  /** Form trajectory data for selected team */
  formData?: FormTrajectoryResponse | null;
}

function applyFilters(
  fixtures: ScheduleFixture[],
  filters: FilterState
): ScheduleFixture[] {
  return fixtures.filter((f) => {
    // Round range filter
    if (f.round < filters.roundStart || f.round > filters.roundEnd) {
      return false;
    }
    // Venue filter (byes always pass venue filter)
    if (!f.isBye) {
      if (filters.venueFilter === 'home' && !f.isHome) return false;
      if (filters.venueFilter === 'away' && f.isHome) return false;
    }
    return true;
  });
}

function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.roundStart !== 1 ||
    filters.roundEnd !== 27 ||
    filters.venueFilter !== 'all'
  );
}

export function TeamScheduleView({
  teams,
  selectedTeamCode,
  onTeamSelect,
  schedule,
  loading,
  error,
  filters,
  onFiltersChange,
  rankings,
  streaks,
  formData,
}: TeamScheduleViewProps) {
  const filteredFixtures = schedule
    ? applyFilters(schedule.schedule, filters)
    : [];

  // Find the current team's ranking
  const teamRanking = rankings?.rankings.find(
    (r) => r.team.code === selectedTeamCode
  );

  return (
    <Box>
      <Box sx={{ mb: 3, maxWidth: 400 }}>
        <TeamSelector
          teams={teams}
          selectedCode={selectedTeamCode}
          onSelect={onTeamSelect}
          disabled={loading}
        />
      </Box>

      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && schedule && (
        <>
          <TeamScheduleSummary
            team={schedule.team}
            totalStrength={schedule.totalStrength}
            byeRounds={schedule.byeRounds}
            fixtureCount={schedule.schedule.length}
            rank={teamRanking?.rank}
            totalTeams={rankings?.rankings.length}
            category={teamRanking?.category}
            formSnapshots={formData?.snapshots}
          />

          <FilterControls
            filters={filters}
            onFiltersChange={onFiltersChange}
            disabled={loading}
            hasActiveFilters={hasActiveFilters(filters)}
          />

          <FixtureTable
            fixtures={filteredFixtures}
            teams={teams}
            streaks={streaks}
          />
        </>
      )}

      {!loading && !error && !schedule && selectedTeamCode === null && (
        <Alert severity="info">
          Select a team from the dropdown above to view their schedule.
        </Alert>
      )}
    </Box>
  );
}
