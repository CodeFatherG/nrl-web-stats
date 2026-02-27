import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
} from '@mui/material';
import { TeamChip } from './TeamChip';
import type { SignificantByeStatsProps } from '../types';

/**
 * Secondary statistics table showing rounds with high bye concentration (>2 byes).
 * Displays affected teams (with byes) and unaffected teams (without byes) for each
 * significant round, with team codes as clickable chips that support cross-table highlighting.
 */
export function SignificantByeStats({
  significantRounds,
  highlightedTeam,
  onTeamClick,
}: SignificantByeStatsProps) {
  // Empty state when no significant rounds exist
  if (significantRounds.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" component="h3" gutterBottom>
          Significant Bye Rounds
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No rounds with more than 2 byes in the selected range.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" component="h3" gutterBottom>
        Significant Bye Rounds
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rounds with more than 2 teams on bye. Click a team to highlight all
        occurrences.
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small" aria-label="Significant bye statistics">
          <TableHead>
            <TableRow>
              {/* Empty corner cell for row labels */}
              <TableCell
                sx={{
                  fontWeight: 'bold',
                  minWidth: 140,
                  backgroundColor: 'background.paper',
                }}
              >
                {/* Empty */}
              </TableCell>
              {/* Round column headers */}
              {significantRounds.map((roundData) => (
                <TableCell
                  key={roundData.round}
                  align="center"
                  sx={{
                    fontWeight: 'bold',
                    minWidth: 120,
                    backgroundColor: 'primary.light',
                    color: 'primary.contrastText',
                  }}
                  aria-label={`Round ${roundData.round}`}
                >
                  Round {roundData.round}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Affected Teams Row */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{
                  fontWeight: 'medium',
                  backgroundColor: 'error.light',
                  color: 'error.contrastText',
                }}
              >
                Affected Teams
              </TableCell>
              {significantRounds.map((roundData) => (
                <TableCell key={`affected-${roundData.round}`} align="center">
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: 0.5,
                    }}
                  >
                    {roundData.affectedTeams.map((teamCode) => (
                      <TeamChip
                        key={teamCode}
                        teamCode={teamCode}
                        isHighlighted={highlightedTeam === teamCode}
                        onClick={onTeamClick}
                      />
                    ))}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
            {/* Unaffected Teams Row */}
            <TableRow>
              <TableCell
                component="th"
                scope="row"
                sx={{
                  fontWeight: 'medium',
                  backgroundColor: 'success.light',
                  color: 'success.contrastText',
                }}
              >
                Unaffected Teams
              </TableCell>
              {significantRounds.map((roundData) => (
                <TableCell key={`unaffected-${roundData.round}`} align="center">
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: 0.5,
                    }}
                  >
                    {roundData.unaffectedTeams.map((teamCode) => (
                      <TeamChip
                        key={teamCode}
                        teamCode={teamCode}
                        isHighlighted={highlightedTeam === teamCode}
                        onClick={onTeamClick}
                      />
                    ))}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
