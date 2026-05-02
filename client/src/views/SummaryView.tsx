import { useState, useEffect, useRef } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { getPlayerMovements } from '../services/api';
import { getTeamBackground } from '../utils/teamColors';
import { MovementSection } from '../components/MovementSection';
import type { CoveringInjuryRecord, InjuredRecord, PlayerMovementsResult } from '../types';

interface SummaryViewProps {
  year: number;
  onPlayerClick: (playerId: string) => void;
}

export function SummaryView({ year, onPlayerClick }: SummaryViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ pending: true } | PlayerMovementsResult | null>(null);
  const cancelledRef = useRef(false);


  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    getPlayerMovements(year)
      .then((result) => {
        if (!cancelledRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load player movements');
          setLoading(false);
        }
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [year]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data || data.pending) {
    return <Alert severity="info">Team lists not yet complete for this round.</Alert>;
  }

  if (data.noPreviousRound) {
    return <Alert severity="info">No previous round data available for comparison.</Alert>;
  }

  const result = data;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Round {result.round} Movements
      </Typography>

      <MovementSection title="Injured" count={result.injured.length} defaultExpanded={false}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Last #</TableCell>
                <TableCell sx={{ py: 0.5 }}>Last Position</TableCell>
                <TableCell sx={{ py: 0.5 }}>Injury</TableCell>
                <TableCell sx={{ py: 0.5 }}>Expected Return</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.injured.map((row: InjuredRecord) => (
                <TableRow key={`injured-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.lastJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.lastPosition}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.injury}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.expectedReturn}</TableCell>
                </TableRow>
              ))}
              {result.injured.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                    No injured players
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>

      <MovementSection title="Dropped" count={result.dropped.length} defaultExpanded={false}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Last #</TableCell>
                <TableCell sx={{ py: 0.5 }}>Last Position</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.dropped.map((row) => (
                <TableRow key={`dropped-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.lastJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.lastPosition}</TableCell>
                </TableRow>
              ))}
              {result.dropped.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                    No dropped players
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>

      <MovementSection title="Benched" count={result.benched.length} defaultExpanded={false}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Was #</TableCell>
                <TableCell sx={{ py: 0.5 }}>Was Position</TableCell>
                <TableCell sx={{ py: 0.5 }}>Consecutive Rounds</TableCell>
                <TableCell sx={{ py: 0.5 }}>Replaced By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.benched.map((row) => (
                <TableRow key={`benched-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.prevJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.prevPosition}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.consecutiveRoundsBenched}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {row.replacedByPlayerId !== null ? (
                      <Link component="button" onClick={() => onPlayerClick(String(row.replacedByPlayerId))}>
                        {row.replacedByPlayerName}
                      </Link>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {result.benched.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                    No benched players
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>

      <MovementSection title="Covering Injury" count={result.coveringInjury.length} defaultExpanded={false}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Jersey</TableCell>
                <TableCell sx={{ py: 0.5 }}>Position</TableCell>
                <TableCell sx={{ py: 0.5 }}>Covering</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.coveringInjury.map((row: CoveringInjuryRecord) => (
                <TableRow key={`covering-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                    {row.prevPosition && (
                      <Chip label={`moved from ${row.prevPosition}`} size="small" color="warning" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.currentJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.currentPosition}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.coveringPlayerId))}>
                      {row.coveringPlayerName}
                    </Link>
                    {' '}(#{row.coveringLastJersey} {row.coveringLastPosition})
                  </TableCell>
                </TableRow>
              ))}
              {result.coveringInjury.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                    No injury cover changes
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>

      <MovementSection title="Promoted" count={result.promoted.length} defaultExpanded={false}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Jersey</TableCell>
                <TableCell sx={{ py: 0.5 }}>Position</TableCell>
                <TableCell sx={{ py: 0.5 }}>Replacing</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.promoted.map((row) => (
                <TableRow key={`promoted-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.currentJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.position}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {row.replacingPlayerId !== null ? (
                      <Link component="button" onClick={() => onPlayerClick(String(row.replacingPlayerId))}>
                        {row.replacingPlayerName}
                      </Link>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {result.promoted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                    No promoted players
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>

      <MovementSection
        title="Returning from Injury"
        count={result.returningFromInjury.length}
        defaultExpanded={false}
      >
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Pre-Injury #</TableCell>
                <TableCell sx={{ py: 0.5 }}>Pre-Injury Position</TableCell>
                <TableCell sx={{ py: 0.5 }}>Current #</TableCell>
                <TableCell sx={{ py: 0.5 }}>Current Position</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.returningFromInjury.map((row) => (
                <TableRow key={`returning-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.lastJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.lastPosition}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.currentJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {row.currentPosition}
                    {row.positionChanged && (
                      <Chip label="Position Changed" color="warning" size="small" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {result.returningFromInjury.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                    No players returning from injury
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>

      <MovementSection
        title="Position Changed"
        count={result.positionChanged.length}
        defaultExpanded={false}
      >
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5 }}>Player</TableCell>
                <TableCell sx={{ py: 0.5 }}>Team</TableCell>
                <TableCell sx={{ py: 0.5 }}>Jersey</TableCell>
                <TableCell sx={{ py: 0.5 }}>Old Position</TableCell>
                <TableCell sx={{ py: 0.5 }}>New Position</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.positionChanged.map((row) => (
                <TableRow key={`position-${row.playerId}`} sx={{ backgroundColor: getTeamBackground(row.teamCode) }}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Link component="button" onClick={() => onPlayerClick(String(row.playerId))}>
                      {row.playerName}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.teamCode}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.currentJersey}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.oldPosition}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>{row.newPosition}</TableCell>
                </TableRow>
              ))}
              {result.positionChanged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                    No position changes
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MovementSection>
    </Box>
  );
}
