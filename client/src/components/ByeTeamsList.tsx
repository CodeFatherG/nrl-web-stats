import { Box, Typography, Chip, Paper } from '@mui/material';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import type { Team } from '../types';

interface ByeTeamsListProps {
  teamCodes: string[];
  teams: Team[];
}

export function ByeTeamsList({ teamCodes, teams }: ByeTeamsListProps) {
  const getTeamName = (code: string): string => {
    const team = teams.find((t) => t.code === code);
    return team?.name ?? code;
  };

  if (teamCodes.length === 0) {
    return null;
  }

  return (
    <Paper sx={{ p: 2, mt: 3, bgcolor: 'grey.100' }}>
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <EventBusyIcon color="action" />
        <Typography variant="subtitle2" color="text.secondary">
          Teams on Bye ({teamCodes.length})
        </Typography>
      </Box>
      <Box display="flex" flexWrap="wrap" gap={1}>
        {teamCodes.map((code) => (
          <Chip
            key={code}
            label={getTeamName(code)}
            size="small"
            variant="outlined"
          />
        ))}
      </Box>
    </Paper>
  );
}
