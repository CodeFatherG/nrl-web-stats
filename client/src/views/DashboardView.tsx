import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { useAppContext } from '../hooks/useAppContext';
import { useSeasonSummaryQuery } from '../hooks/useSeasonQuery';
import { useMovementsQuery } from '../hooks/useMovementsQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { StatCard } from '../components/shared/StatCard';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { CompactRound } from '../components/CompactRound';

export function DashboardView() {
  const { currentYear } = useAppContext();
  const [searchParams] = useSearchParams();
  const year = Number(searchParams.get('year') ?? currentYear);
  const navigate = useNavigate();

  const seasonQuery = useSeasonSummaryQuery(year);
  const movementsQuery = useMovementsQuery(year);

  const currentRound = useMemo(() => {
    if (!seasonQuery.data) return null;
    const roundsWithLists = seasonQuery.data.rounds.filter(r => r.hasTeamLists);
    if (roundsWithLists.length > 0) return roundsWithLists[roundsWithLists.length - 1] ?? null;
    const completedRounds = seasonQuery.data.rounds.filter(r => r.matches.some(m => m.isComplete));
    return completedRounds.length > 0
      ? completedRounds[completedRounds.length - 1] ?? null
      : seasonQuery.data.rounds[0] ?? null;
  }, [seasonQuery.data]);

  const stats = useMemo(() => {
    if (!seasonQuery.data) return null;
    const rounds = seasonQuery.data.rounds;
    const totalRounds = rounds.length;
    const completedRounds = rounds.filter(r => r.matches.some(m => m.isComplete)).length;
    const totalMatches = rounds.reduce((s, r) => s + r.matches.length, 0);
    const completedMatches = rounds.reduce(
      (s, r) => s + r.matches.filter(m => m.isComplete).length, 0
    );
    return { totalRounds, completedRounds, totalMatches, completedMatches };
  }, [seasonQuery.data]);

  const movementCount = useMemo(() => {
    const data = movementsQuery.data;
    if (!data || data.pending || data.noPreviousRound) return 0;
    return (
      data.injured.length +
      data.dropped.length +
      data.benched.length +
      data.returningFromInjury.length +
      data.coveringInjury.length +
      data.promoted.length +
      data.positionChanged.length
    );
  }, [movementsQuery.data]);

  if (seasonQuery.isLoading) return <SkeletonPage variant="match-list" />;
  if (seasonQuery.isError) return (
    <Alert severity="error">Failed to load season data. Please try again.</Alert>
  );

  const thresholds = seasonQuery.data?.thresholds;

  return (
    <Box>
      <PageHeader
        title={`NRL ${year}`}
        subtitle={stats ? `Round ${stats.completedRounds} of ${stats.totalRounds}` : undefined}
      />

      {movementCount > 0 && !movementsQuery.isLoading && (
        <Alert
          severity="info"
          sx={{ mb: 2, cursor: 'pointer' }}
          onClick={() => navigate(`/summary${searchParams.toString() ? `?${searchParams}` : ''}`)}
        >
          {movementCount} player movement{movementCount !== 1 ? 's' : ''} detected — view Summary
        </Alert>
      )}

      {/* Stat strip */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatCard label="Season" value={String(year)} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Rounds Played" value={String(stats.completedRounds)} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Total Rounds" value={String(stats.totalRounds)} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Matches Played" value={`${stats.completedMatches}/${stats.totalMatches}`} />
          </Grid>
        </Grid>
      )}

      {/* Current round hero */}
      {currentRound && (
        <SectionCard title={`Current: Round ${currentRound.round}`} sx={{ mb: 3 }}>
          <CompactRound
            round={currentRound}
            year={year}
            onClick={() => navigate(`/round/${currentRound.round}${searchParams.toString() ? `?${searchParams}` : ''}`)}
            onMatchClick={(matchId) => navigate(`/match/${matchId}`)}
            strengthThresholds={thresholds}
          />
        </SectionCard>
      )}

      {/* Season grid */}
      <SectionCard title="Season Overview">
        <Grid container spacing={1}>
          {seasonQuery.data?.rounds.map(round => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={round.round}>
              <CompactRound
                round={round}
                year={year}
                onClick={() => navigate(`/round/${round.round}${searchParams.toString() ? `?${searchParams}` : ''}`)}
                onMatchClick={(matchId) => navigate(`/match/${matchId}`)}
                strengthThresholds={thresholds}
              />
            </Grid>
          ))}
        </Grid>
      </SectionCard>
    </Box>
  );
}
