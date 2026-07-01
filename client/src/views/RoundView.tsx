import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useAppContext } from '../hooks/useAppContext';
import { useRoundQuery, useMatchOutlookQuery, useGameStrengthQuery } from '../hooks/useRoundQuery';
import { isGSRAvailable } from '../services/api';
import { useAllRankingsQuery } from '../hooks/useTeamQuery';
import { useSeasonSummaryQuery } from '../hooks/useSeasonQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { MatchCard } from '../components/domain/MatchCard';
import { ByeTeamsList } from '../components/ByeTeamsList';
import { createMatchId } from '../utils/matchId';

export function RoundView() {
  const { n } = useParams<{ n?: string }>();
  const { currentYear, teams } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(searchParams.get('year') ?? currentYear);

  const seasonQuery = useSeasonSummaryQuery(year);

  const derivedRound = useMemo(() => {
    if (n) return Number(n);
    if (!seasonQuery.data) return 0;
    const withLists = seasonQuery.data.rounds.filter(r => r.hasTeamLists);
    if (withLists.length > 0) return withLists[withLists.length - 1]?.round ?? 1;
    const completed = seasonQuery.data.rounds.filter(r => r.matches.some(m => m.isComplete));
    const last = completed[completed.length - 1];
    if (last) return last.round;
    return seasonQuery.data.rounds[0]?.round ?? 1;
  }, [n, seasonQuery.data]);

  useEffect(() => {
    if (!n && derivedRound > 0) {
      navigate(`/round/${derivedRound}`, { replace: true });
    }
  }, [n, derivedRound, navigate]);

  const roundQuery = useRoundQuery(year, derivedRound);
  const outlookQuery = useMatchOutlookQuery(year, derivedRound);
  const gsrQuery = useGameStrengthQuery(year, derivedRound);
  const rankingsQuery = useAllRankingsQuery(year);

  const gsrByTeam = useMemo(() => {
    const map = new Map<string, { gsr: number; warning: boolean }>();
    if (gsrQuery.data && isGSRAvailable(gsrQuery.data)) {
      for (const match of gsrQuery.data.matches) {
        map.set(match.homeTeam.teamCode, { gsr: match.homeTeam.normalizedOverallGSR, warning: match.homeTeam.sampleSizeWarning });
        map.set(match.awayTeam.teamCode, { gsr: match.awayTeam.normalizedOverallGSR, warning: match.awayTeam.sampleSizeWarning });
      }
    }
    return map;
  }, [gsrQuery.data]);

  const maxRound = seasonQuery.data?.rounds.length ?? 27;
  const thresholds = rankingsQuery.data?.thresholds;

  const outlookByMatchId = useMemo(() => {
    const map = new Map<string, { label: 'Easy' | 'Competitive' | 'Tough' | 'Upset Alert' }>();
    // Spec 037: branch on availability before reading data.
    if (outlookQuery.data?.available) {
      for (const m of outlookQuery.data.data.matches) {
        map.set(m.matchId, { label: m.label });
      }
    }
    return map;
  }, [outlookQuery.data]);

  if (!n && derivedRound === 0) return <SkeletonPage variant="match-list" />;
  if (roundQuery.isLoading) return <SkeletonPage variant="match-list" />;
  if (roundQuery.isError) return (
    <Alert severity="error">Failed to load round data.</Alert>
  );

  const roundData = roundQuery.data;

  const stepper = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton
        onClick={() => navigate(`/round/${derivedRound - 1}`)}
        disabled={derivedRound <= 1}
        size="small"
      >
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="body2" fontWeight={600} sx={{ minWidth: 64, textAlign: 'center' }}>
        Round {derivedRound}
      </Typography>
      <IconButton
        onClick={() => navigate(`/round/${derivedRound + 1}`)}
        disabled={derivedRound >= maxRound}
        size="small"
      >
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );

  return (
    <Box>
      <PageHeader title={`Round ${derivedRound}`} subtitle={`${year} NRL Season`} actions={stepper} />

      <Grid container spacing={2}>
        {roundData?.matches.map((match, i) => {
          const matchId = createMatchId(year, derivedRound, match.homeTeam, match.awayTeam);
          const outlook = outlookByMatchId.get(matchId);
          return (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <MatchCard
                homeTeamCode={match.homeTeam}
                awayTeamCode={match.awayTeam}
                homeTeamName={match.homeTeam}
                awayTeamName={match.awayTeam}
                homeStrength={match.homeStrength}
                awayStrength={match.awayStrength}
                homeGSR={gsrByTeam.get(match.homeTeam)?.gsr}
                awayGSR={gsrByTeam.get(match.awayTeam)?.gsr}
                homeGSRWarning={gsrByTeam.get(match.homeTeam)?.warning}
                awayGSRWarning={gsrByTeam.get(match.awayTeam)?.warning}
                homeScore={match.homeScore}
                awayScore={match.awayScore}
                isComplete={match.isComplete}
                scheduledTime={match.scheduledTime}
                stadium={match.stadium}
                weather={match.weather}
                outlookLabel={outlook?.label}
                strengthThresholds={thresholds}
                onClick={() => navigate(`/match/${matchId}`)}
              />
            </Grid>
          );
        })}
      </Grid>

      {roundData?.byeTeams && roundData.byeTeams.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <ByeTeamsList teamCodes={roundData.byeTeams} teams={teams} />
        </Box>
      )}
    </Box>
  );
}
