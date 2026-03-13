import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';

interface NoDataStateProps {
  onLoadData: (year: number) => void;
  loading?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [2026];

export function NoDataState({ onLoadData, loading = false }: NoDataStateProps) {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  const handleLoad = () => {
    onLoadData(selectedYear);
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding={4}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent>
          <Typography variant="h5" gutterBottom textAlign="center">
            No Schedule Data Loaded
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            textAlign="center"
            sx={{ mb: 3 }}
          >
            Load the NRL schedule data to view team schedules, fixtures, and
            strength of schedule analysis.
          </Typography>

          <Box display="flex" gap={2} alignItems="flex-end">
            <FormControl fullWidth size="small">
              <InputLabel id="year-select-label">Year</InputLabel>
              <Select
                labelId="year-select-label"
                value={selectedYear}
                label="Year"
                onChange={(e) => setSelectedYear(e.target.value as number)}
                disabled={loading}
              >
                {AVAILABLE_YEARS.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              onClick={handleLoad}
              disabled={loading}
              startIcon={
                loading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <DownloadIcon />
                )
              }
              sx={{ minWidth: 160, whiteSpace: 'nowrap' }}
            >
              {loading ? 'Loading...' : 'Load Schedule'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
