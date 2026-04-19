import { useState, useEffect, useMemo } from 'react';
import { Box, CircularProgress, Alert, Typography, Button } from '@mui/material';
import { CompactRound } from '../components/CompactRound';
import { YearSelect } from '../components/YearSelect';
import { getSeasonSummary } from '../services/api';
import type { SeasonSummaryResponse, StrengthThresholds } from '../types';

interface CompactSeasonViewProps {
  year: number;
  seasonData: SeasonSummaryResponse | null;
  loading: boolean;
  error: string | null;
  loadedYears: number[];
  onRetry?: () => void;
  onRoundClick?: (round: number) => void;
  onMatchClick?: (matchId: string) => void;
}

export function CompactSeasonView({
  year,
  seasonData,
  loading,
  error,
  loadedYears,
  onRetry,
  onRoundClick,
  onMatchClick,
}: CompactSeasonViewProps) {
  const [selectedYear, setSelectedYear] = useState(year);
  const [altData, setAltData] = useState<SeasonSummaryResponse | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);

  // When the parent's default year changes, reset to it
  useEffect(() => {
    setSelectedYear(year);
    setAltData(null);
    setAltError(null);
  }, [year]);

  const handleYearChange = async (newYear: number) => {
    setSelectedYear(newYear);
    if (newYear === year) {
      setAltData(null);
      setAltError(null);
      return;
    }
    setAltLoading(true);
    setAltError(null);
    try {
      const data = await getSeasonSummary(newYear);
      setAltData(data);
    } catch (err) {
      setAltError(err instanceof Error ? err.message : 'Failed to load season data');
    } finally {
      setAltLoading(false);
    }
  };

  const displayData = selectedYear === year ? seasonData : altData;
  const displayLoading = selectedYear === year ? loading : altLoading;
  const displayError = selectedYear === year ? error : altError;

  const strengthThresholds: StrengthThresholds = useMemo(() => {
    if (!displayData?.thresholds) {
      return { p33: 300, p67: 400 };
    }
    return displayData.thresholds;
  }, [displayData]);

  if (displayLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (displayError) {
    return (
      <Box>
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            selectedYear === year && onRetry && (
              <Button color="inherit" size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
        >
          {displayError}
        </Alert>
      </Box>
    );
  }

  if (!displayData || displayData.rounds.length === 0) {
    return (
      <Box>
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <YearSelect loadedYears={loadedYears} value={selectedYear} onChange={handleYearChange} />
        </Box>
        <Box textAlign="center" py={4}>
          <Typography variant="h6" color="text.secondary">
            No rounds available for {selectedYear} season
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box display="flex" alignItems="center" gap={2} mb={1}>
        <YearSelect loadedYears={loadedYears} value={selectedYear} onChange={handleYearChange} />
        <Typography variant="h6">
          Season Overview
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {displayData.rounds.length} rounds - Click a round to view details
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 1,
          minWidth: 0,
        }}
      >
        {displayData.rounds.map((round) => (
          <CompactRound
            key={round.round}
            round={round}
            year={selectedYear}
            onClick={onRoundClick ? () => onRoundClick(round.round) : undefined}
            onMatchClick={onMatchClick}
            strengthThresholds={strengthThresholds}
          />
        ))}
      </Box>
    </Box>
  );
}
