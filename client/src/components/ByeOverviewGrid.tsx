import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
} from '@mui/material';
import { ByeIndicator } from './ByeIndicator';
import { getByeConcentrationColor } from '../utils/byeGridUtils';
import type { ByeGridData } from '../types';

interface ByeOverviewGridProps {
  byeGridData: ByeGridData;
  highlightedRow: string | null;
  highlightedColumn: number | null;
  roundRange: [number, number];
  onRowClick: (teamCode: string) => void;
  onColumnClick: (round: number) => void;
}

export function ByeOverviewGrid({
  byeGridData,
  highlightedRow,
  highlightedColumn,
  roundRange,
  onRowClick,
  onColumnClick,
  
}: ByeOverviewGridProps) {
  const { teams, rounds, byeMap, byeCountByRound, maxByeCount, columnStrengths, rowStrengths } = byeGridData;

  // Filter rounds based on roundRange
  const visibleRounds = rounds.filter(
    (round) => round >= roundRange[0] && round <= roundRange[1]
  );

  // Check if a cell should be highlighted
  const isCellHighlighted = (teamCode: string, round: number): boolean => {
    return highlightedRow === teamCode || highlightedColumn === round;
  };

  // Check if team has bye in round
  const hasByeInRound = (teamCode: string, round: number): boolean => {
    return byeMap.get(teamCode)?.has(round) ?? false;
  };

  return (
    <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
      <Table stickyHeader size="small" aria-label="Bye overview grid">
        <TableHead>
          <TableRow>
            {/* Empty corner cell */}
            <TableCell
              sx={{
                fontWeight: 'bold',
                position: 'sticky',
                left: 0,
                zIndex: 3,
                backgroundColor: 'background.paper',
                minWidth: 150,
              }}
            >
              Team
            </TableCell>
            {/* Round column headers */}
            {visibleRounds.map((round) => {
              const byeCount = byeCountByRound.get(round) ?? 0;
              const concentrationColor = getByeConcentrationColor(byeCount, maxByeCount);
              const isHighlighted = highlightedColumn === round;

              let columnColour = isHighlighted ? 'action.selected' : concentrationColor;
              if (columnStrengths.has(round) && !isHighlighted) {
                const strength = columnStrengths.get(round) ?? 0;
                if (strength > 0) {
                  //#81C784
                  columnColour = `rgb(129, 199, 132)`;
                } else {
                  //#E57373
                  columnColour = `rgb(229, 115, 115)`;
                }
              }

              return (
                <TableCell
                  key={round}
                  align="center"
                  onClick={() => onColumnClick(round)}
                  sx={{
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    backgroundColor: columnColour,
                    minWidth: 40,
                    '&:hover': {
                      backgroundColor: isHighlighted
                        ? 'action.selected'
                        : 'action.hover',
                    },
                    userSelect: 'none',
                  }}
                  aria-label={`Round ${round}, ${byeCount} team${byeCount !== 1 ? 's' : ''} on bye`}
                >
                  {round}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {teams.map((team) => {
            const isRowHighlighted = highlightedRow === team.code;
            let rowColour = isRowHighlighted ? 'action.selected' :'background.paper';
            if (rowStrengths.has(team.code) && !isRowHighlighted) {
              const strength = rowStrengths.get(team.code) ?? 0;
              if (strength > 0) {
                //#81C784
                rowColour = `rgb(129, 199, 132)`;
              } else {
                //#E57373
                rowColour = `rgb(229, 115, 115)`;
              }
            }
            return (
              <TableRow key={team.code}>
                {/* Team name row header */}
                <TableCell
                  component="th"
                  scope="row"
                  onClick={() => onRowClick(team.code)}
                  sx={{
                    fontWeight: 'medium',
                    cursor: 'pointer',
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    backgroundColor: rowColour,
                    '&:hover': {
                      backgroundColor: isRowHighlighted
                        ? 'action.selected'
                        : 'action.hover',
                    },
                    userSelect: 'none',
                  }}
                  aria-label={`${team.name}, click to highlight row`}
                >
                  {team.name}
                </TableCell>
                {/* Grid cells */}
                {visibleRounds.map((round) => {
                  const hasBye = hasByeInRound(team.code, round);
                  const isHighlighted = isCellHighlighted(team.code, round);

                  return (
                    <TableCell
                      key={round}
                      align="center"
                      sx={{
                        backgroundColor: isHighlighted
                          ? 'action.selected'
                          : undefined,
                        padding: '4px',
                      }}
                    >
                      {hasBye && (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          <ByeIndicator />
                        </Box>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
