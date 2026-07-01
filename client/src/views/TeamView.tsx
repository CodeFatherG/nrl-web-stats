import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { useAppContext } from '../hooks/useAppContext';
import {
  useTeamScheduleQuery,
  useTeamFormQuery,
  useAllRankingsQuery,
} from '../hooks/useTeamQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { FormSparkline } from '../components/FormSparkline';
import { FilterControls } from '../components/FilterControls';
import { StrengthBadge } from '../components/StrengthBadge';
import { GSRBadge } from '../components/GSRBadge';
import { VenueBadge } from '../components/VenueBadge';
import { useQueries } from '@tanstack/react-query';
import { getGameStrengthRatings, isGSRAvailable } from '../services/api';
import { formatMatchDate } from '../utils/formatMatchDate';
import { createMatchId } from '../utils/matchId';
import type { ScheduleFixture, FilterState } from '../types';

const DEFAULT_FILTERS: FilterState = { roundStart: 1, roundEnd: 27, venueFilter: 'all' };

export function TeamView() {
  const { code } = useParams<{ code?: string }>();
  const { currentYear, teams } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(searchParams.get('year') ?? currentYear);

  const firstTeamCode = teams[0]?.code ?? '';
  const teamCode = code ?? firstTeamCode;

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const scheduleQuery = useTeamScheduleQuery(year, teamCode);
  const formQuery = useTeamFormQuery(year, teamCode);
  const rankingsQuery = useAllRankingsQuery(year);

  const thresholds = scheduleQuery.data?.thresholds ?? rankingsQuery.data?.thresholds;

  const filteredFixtures = (scheduleQuery.data?.schedule ?? []).filter(f => {
    if (f.isBye) return false;
    if (f.round < filters.roundStart || f.round > filters.roundEnd) return false;
    if (filters.venueFilter === 'home' && !f.isHome) return false;
    if (filters.venueFilter === 'away' && f.isHome) return false;
    return true;
  });

  // Fetch GSR for every round this team plays in (deduped). Locked + cached rounds are cheap.
  const uniqueRounds = Array.from(new Set(filteredFixtures.map(f => f.round)));
  const gsrQueries = useQueries({
    queries: uniqueRounds.map(round => ({
      queryKey: ['gameStrength', year, round],
      queryFn: () => getGameStrengthRatings(year, round),
      enabled: year > 0 && round > 0,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const gsrByRoundAndTeam = new Map<string, { gsr: number; warning: boolean }>();
  gsrQueries.forEach((q, i) => {
    if (q.data && isGSRAvailable(q.data)) {
      const round = uniqueRounds[i];
      for (const match of q.data.matches) {
        gsrByRoundAndTeam.set(`${round}:${match.homeTeam.teamCode}`, { gsr: match.homeTeam.normalizedOverallGSR, warning: match.homeTeam.sampleSizeWarning });
        gsrByRoundAndTeam.set(`${round}:${match.awayTeam.teamCode}`, { gsr: match.awayTeam.normalizedOverallGSR, warning: match.awayTeam.sampleSizeWarning });
      }
    }
  });

  const columns = [
    { key: 'round', label: 'Rd', align: 'center' as const, sortable: true,
      getValue: (f: ScheduleFixture) => f.round,
      renderCell: (f: ScheduleFixture) => <Typography variant="caption">{f.round}</Typography> },
    { key: 'opponent', label: 'Opponent', align: 'left' as const,
      renderCell: (f: ScheduleFixture) => (
        <Typography variant="caption">{f.isBye ? 'BYE' : (f.opponent ?? '—')}</Typography>
      ) },
    { key: 'venue', label: 'H/A', align: 'center' as const, hideOnMobile: true,
      renderCell: (f: ScheduleFixture) => f.isBye ? null : <VenueBadge isHome={f.isHome} /> },
    { key: 'strength', label: 'Strength', align: 'center' as const, sortable: true,
      getValue: (f: ScheduleFixture) => f.strengthRating,
      renderCell: (f: ScheduleFixture) => (
        <StrengthBadge rating={f.strengthRating} thresholds={thresholds} />
      ) },
    { key: 'gsr', label: 'GSR', align: 'center' as const, sortable: true,
      getValue: (f: ScheduleFixture) => gsrByRoundAndTeam.get(`${f.round}:${teamCode}`)?.gsr ?? null,
      renderCell: (f: ScheduleFixture) => {
        const entry = gsrByRoundAndTeam.get(`${f.round}:${teamCode}`);
        if (!entry) return <Typography variant="caption" color="text.disabled">—</Typography>;
        return <GSRBadge normalizedGSR={entry.gsr} sampleSizeWarning={entry.warning} />;
      } },
    { key: 'date', label: 'Date', align: 'left' as const, hideOnMobile: true,
      renderCell: (f: ScheduleFixture) => (
        <Typography variant="caption" color="text.secondary">
          {f.scheduledTime ? formatMatchDate(f.scheduledTime) : '—'}
        </Typography>
      ) },
    { key: 'stadium', label: 'Stadium', align: 'left' as const, hideOnMobile: true,
      renderCell: (f: ScheduleFixture) => (
        <Typography variant="caption" color="text.secondary">{f.stadium ?? '—'}</Typography>
      ) },
    { key: 'result', label: 'Result', align: 'center' as const,
      renderCell: (f: ScheduleFixture) => {
        if (!f.isComplete || f.homeScore == null || f.awayScore == null) return <Typography variant="caption" color="text.disabled">—</Typography>;
        const teamScore = f.isHome ? f.homeScore : f.awayScore;
        const oppScore = f.isHome ? f.awayScore : f.homeScore;
        const won = teamScore > oppScore;
        return (
          <Typography variant="caption" fontWeight={600} color={won ? 'success.main' : 'error.main'}>
            {won ? 'W' : 'L'} {teamScore}–{oppScore}
          </Typography>
        );
      } },
  ];

  if (scheduleQuery.isLoading) return <SkeletonPage variant="table" />;
  if (scheduleQuery.isError) return <Alert severity="error">Failed to load team schedule.</Alert>;

  return (
    <Box>
      <PageHeader
        title={scheduleQuery.data?.team.name ?? teamCode}
        subtitle={`${year} Season Schedule`}
      />

      {/* Team selector chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        {teams.map(t => (
          <Chip
            key={t.code}
            label={t.code}
            size="small"
            variant={t.code === teamCode ? 'filled' : 'outlined'}
            color={t.code === teamCode ? 'primary' : 'default'}
            onClick={() => navigate(`/team/${t.code}${searchParams.toString() ? `?${searchParams}` : ''}`)}
          />
        ))}
      </Box>

      {/* Form sparkline — spec 037: AvailabilityEnvelope */}
      {formQuery.data?.available && formQuery.data.data.snapshots.length > 0 && (
        <SectionCard title="Form" sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <FormSparkline snapshots={formQuery.data.data.snapshots} width={200} height={40} />
            {formQuery.data.data.classification && (
              <Typography variant="caption" color="text.secondary">
                {formQuery.data.data.classification}
              </Typography>
            )}
          </Box>
        </SectionCard>
      )}

      {/* Filters */}
      <Box sx={{ mb: 2 }}>
        <FilterControls
          filters={filters}
          onFiltersChange={setFilters}
          hasActiveFilters={
            filters.roundStart !== 1 || filters.roundEnd !== 27 || filters.venueFilter !== 'all'
          }
        />
      </Box>

      {/* Schedule table */}
      <SectionCard>
        <DataTable
          columns={columns}
          rows={filteredFixtures}
          getRowKey={f => `${f.round}-${f.opponent}`}
          stickyHeader
          maxHeight="60vh"
          emptyMessage="No fixtures match the current filters."
          defaultSortKey="round"
          defaultSortDir="asc"
          onRowClick={f => {
            if (!f.opponent) return;
            navigate(`/match/${createMatchId(f.year, f.round, teamCode, f.opponent)}`);
          }}
        />
      </SectionCard>
    </Box>
  );
}
