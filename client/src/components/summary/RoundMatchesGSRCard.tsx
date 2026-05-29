import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { useRoundQuery, useGameStrengthQuery } from '../../hooks/useRoundQuery';
import { isGSRAvailable } from '../../services/api';
import { MatchCard } from '../domain/MatchCard';
import { createMatchId } from '../../utils/matchId';

interface RoundMatchesGSRCardProps {
  year: number;
  round: number;
  title?: string;
  subtitle?: string;
}

export function RoundMatchesGSRCard({ year, round, title, subtitle }: RoundMatchesGSRCardProps) {
  const headerTitle = title ?? `Round ${round}`;
  const headerSubtitle = subtitle ?? 'Game Strength Ratings';
  const navigate = useNavigate();
  const roundQuery = useRoundQuery(year, round);
  const gsrQuery = useGameStrengthQuery(year, round);

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

  if (roundQuery.isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 1.25, height: '100%' }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>{headerTitle}</Typography>
        <Skeleton variant="rectangular" height={80} />
      </Paper>
    );
  }
  if (roundQuery.isError || !roundQuery.data) {
    return <Alert severity="error">Failed to load round matches.</Alert>;
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.25, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
        <Typography variant="subtitle2" fontWeight={600}>{headerTitle}</Typography>
        <Typography variant="caption" color="text.secondary">{headerSubtitle}</Typography>
      </Box>
      <Grid container spacing={1}>
        {roundQuery.data.matches.map((match, i) => {
          const matchId = createMatchId(year, round, match.homeTeam, match.awayTeam);
          return (
            <Grid item xs={12} sm={6} key={i}>
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
                compact
                showStrength={false}
                showGSRValue
                onClick={() => navigate(`/match/${matchId}`)}
              />
            </Grid>
          );
        })}
      </Grid>
    </Paper>
  );
}
