import {
  Box,
  Typography,
  Slider,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Paper,
  Stack,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import FlightIcon from '@mui/icons-material/Flight';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import ClearIcon from '@mui/icons-material/Clear';
import type { FilterState } from '../types';

interface FilterControlsProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  disabled?: boolean;
  hasActiveFilters?: boolean;
}

export function FilterControls({
  filters,
  onFiltersChange,
  disabled = false,
  hasActiveFilters = false,
}: FilterControlsProps) {
  const handleRoundRangeChange = (_event: Event, newValue: number | number[]) => {
    if (Array.isArray(newValue) && newValue.length === 2) {
      onFiltersChange({
        ...filters,
        roundStart: newValue[0] ?? 1,
        roundEnd: newValue[1] ?? 27,
      });
    }
  };

  const handleVenueFilterChange = (
    _event: React.MouseEvent<HTMLElement>,
    newValue: string | null
  ) => {
    if (newValue !== null) {
      onFiltersChange({
        ...filters,
        venueFilter: newValue as 'all' | 'home' | 'away',
      });
    }
  };

  const handleClearFilters = () => {
    onFiltersChange({
      roundStart: 1,
      roundEnd: 27,
      venueFilter: 'all',
    });
  };

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box
        display="flex"
        flexDirection={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        gap={3}
      >
        {/* Round Range Filter */}
        <Box flex={1} minWidth={200}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Round Range: {filters.roundStart} - {filters.roundEnd}
          </Typography>
          <Slider
            value={[filters.roundStart, filters.roundEnd]}
            onChange={handleRoundRangeChange}
            valueLabelDisplay="auto"
            min={1}
            max={27}
            marks={[
              { value: 1, label: '1' },
              { value: 14, label: '14' },
              { value: 27, label: '27' },
            ]}
            disabled={disabled}
          />
        </Box>

        <Stack alignItems={'flex-end'}>
          {/* Venue Filter */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Venue
            </Typography>
            <ToggleButtonGroup
              value={filters.venueFilter}
              exclusive
              onChange={handleVenueFilterChange}
              size="small"
              disabled={disabled}
            >
              <ToggleButton value="all">
                <AllInclusiveIcon sx={{ mr: 0.5 }} fontSize="small" />
                All
              </ToggleButton>
              <ToggleButton value="home">
                <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
                Home
              </ToggleButton>
              <ToggleButton value="away">
                <FlightIcon sx={{ mr: 0.5 }} fontSize="small" />
                Away
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {/* Clear Filters */}
          <Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              disabled={disabled || !hasActiveFilters}
              sx={{ mt: { xs: 0, md: 2.5 } }}
            >
              Clear Filters
            </Button>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
}
