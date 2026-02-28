import { useMemo } from 'react';
import { Box, CircularProgress, Alert, Typography, Button } from '@mui/material';
import { CompactRound } from '../components/CompactRound';
import type { SeasonSummaryResponse, StrengthThresholds } from '../types';

interface CompactSeasonViewProps {
  year: number;
  seasonData: SeasonSummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onRoundClick?: (round: number) => void;
}

export function CompactSeasonView({
  year,
  seasonData,
  loading,
  error,
  onRetry,
  onRoundClick,
}: CompactSeasonViewProps) {
  // Use server-provided season-wide thresholds
  const strengthThresholds: StrengthThresholds = useMemo(() => {
    if (!seasonData?.thresholds) {
      return { p33: 300, p67: 400 }; // Default values before data loads
    }
    return seasonData.thresholds;
  }, [seasonData]);

  // Loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box>
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            onRetry && (
              <Button color="inherit" size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  // Empty state
  if (!seasonData || seasonData.rounds.length === 0) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="text.secondary">
          No rounds available for {year} season
        </Typography>
      </Box>
    );
  }

  // Ready state - 9x3 grid layout
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Typography variant="h6" gutterBottom>
        {year} Season Overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {seasonData.rounds.length} rounds - Click a round to view details
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 1,
          minWidth: 0,
        }}
      >
        {seasonData.rounds.map((round) => (
          <CompactRound
            key={round.round}
            round={round}
            onClick={onRoundClick ? () => onRoundClick(round.round) : undefined}
            strengthThresholds={strengthThresholds}
          />
        ))}
      </Box>
    </Box>
  );
}
