import { useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { TeamSelector } from '../components/TeamSelector';
import { TeamScheduleSummary } from '../components/TeamScheduleSummary';
import { FixtureTable } from '../components/FixtureTable';
import { FilterControls } from '../components/FilterControls';
import { YearSelect } from '../components/YearSelect';
import { getTeamSchedule, getTeamStreaks, getTeamForm } from '../services/api';
import type {
  Team,
  TeamScheduleResponse,
  FilterState,
  ScheduleFixture,
  AllTeamsRankingResponse,
  Streak,
} from '../types';
import type { FormTrajectoryResponse } from '../services/api';
import { createMatchId } from '../utils/matchId';

interface TeamScheduleViewProps {
  teams: Team[];
  selectedTeamCode: string | null;
  onTeamSelect: (code: string) => void;
  schedule: TeamScheduleResponse | null;
  loading: boolean;
  error: string | null;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  /** The year the parent-provided schedule data is for */
  year: number;
  /** All years available for switching */
  loadedYears: number[];
  /** Rankings data for all teams */
  rankings?: AllTeamsRankingResponse | null;
  /** Streak analysis data for selected team */
  streaks?: Streak[];
  /** Form trajectory data for selected team */
  formData?: FormTrajectoryResponse | null;
  /** Callback when a match fixture is clicked */
  onMatchClick?: (matchId: string) => void;
}

function applyFilters(
  fixtures: ScheduleFixture[],
  filters: FilterState
): ScheduleFixture[] {
  return fixtures.filter((f) => {
    if (f.round < filters.roundStart || f.round > filters.roundEnd) {
      return false;
    }
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
  year,
  loadedYears,
  rankings,
  streaks,
  formData,
  onMatchClick,
}: TeamScheduleViewProps) {
  const [selectedYear, setSelectedYear] = useState(year);
  const [altSchedule, setAltSchedule] = useState<TeamScheduleResponse | null>(null);
  const [altStreaks, setAltStreaks] = useState<Streak[]>([]);
  const [altFormData, setAltFormData] = useState<FormTrajectoryResponse | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);

  // When the team changes, reset to the default year
  useEffect(() => {
    setSelectedYear(year);
    setAltSchedule(null);
    setAltStreaks([]);
    setAltFormData(null);
    setAltError(null);
  }, [selectedTeamCode, year]);

  const handleYearChange = useCallback(async (newYear: number) => {
    setSelectedYear(newYear);
    if (newYear === year || !selectedTeamCode) {
      setAltSchedule(null);
      setAltStreaks([]);
      setAltFormData(null);
      setAltError(null);
      return;
    }
    setAltLoading(true);
    setAltError(null);
    try {
      const s = await getTeamSchedule(selectedTeamCode, newYear);
      setAltSchedule(s);
      try {
        const sr = await getTeamStreaks(newYear, selectedTeamCode);
        setAltStreaks(sr.streaks);
      } catch { /* optional */ }
      try {
        const fr = await getTeamForm(newYear, selectedTeamCode);
        setAltFormData(fr);
      } catch { /* optional */ }
    } catch (err) {
      setAltError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setAltLoading(false);
    }
  }, [year, selectedTeamCode]);

  const isAlt = selectedYear !== year;
  const displaySchedule = isAlt ? altSchedule : schedule;
  const displayStreaks  = isAlt ? altStreaks  : (streaks ?? []);
  const displayFormData = isAlt ? altFormData : (formData ?? null);
  const displayLoading  = isAlt ? altLoading  : loading;
  const displayError    = isAlt ? altError    : error;

  const filteredFixtures = displaySchedule
    ? applyFilters(displaySchedule.schedule, filters)
    : [];

  const teamRanking = rankings?.rankings.find(
    (r) => r.team.code === selectedTeamCode
  );

  const handleFixtureClick = useCallback(
    (fixture: ScheduleFixture) => {
      if (!onMatchClick || !selectedTeamCode || !fixture.opponent) return;
      const matchId = createMatchId(fixture.year, fixture.round, selectedTeamCode, fixture.opponent);
      onMatchClick(matchId);
    },
    [onMatchClick, selectedTeamCode]
  );

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, maxWidth: 600 }}>
        <TeamSelector
          teams={teams}
          selectedCode={selectedTeamCode}
          onSelect={(code) => { onTeamSelect(code); }}
          disabled={loading}
        />
        <YearSelect
          loadedYears={loadedYears}
          value={selectedYear}
          onChange={handleYearChange}
        />
      </Box>

      {displayLoading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {displayError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {displayError}
        </Alert>
      )}

      {!displayLoading && !displayError && displaySchedule && (
        <>
          <TeamScheduleSummary
            team={displaySchedule.team}
            totalStrength={displaySchedule.totalStrength}
            byeRounds={displaySchedule.byeRounds}
            fixtureCount={displaySchedule.schedule.length}
            rank={teamRanking?.rank}
            totalTeams={rankings?.rankings.length}
            category={teamRanking?.category}
            formSnapshots={displayFormData?.snapshots}
          />

          <FilterControls
            filters={filters}
            onFiltersChange={onFiltersChange}
            disabled={displayLoading}
            hasActiveFilters={hasActiveFilters(filters)}
          />

          <FixtureTable
            fixtures={filteredFixtures}
            teams={teams}
            streaks={displayStreaks}
            onFixtureClick={onMatchClick ? handleFixtureClick : undefined}
          />
        </>
      )}

      {!displayLoading && !displayError && !displaySchedule && selectedTeamCode === null && (
        <Alert severity="info">
          Select a team from the dropdown above to view their schedule.
        </Alert>
      )}
    </Box>
  );
}
