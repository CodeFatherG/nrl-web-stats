import { useState, useMemo, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Typography,
  Box,
  TextField,
  CircularProgress,
  Link,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { getCasualtyWard } from '../services/api';
import type { PlayerSeasonSummary, Team } from '../types';

type SortKey = keyof PlayerSeasonSummary;
type SortDirection = 'asc' | 'desc';

type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

function positionChipColor(position: string): ChipColor {
  const pos = position.toLowerCase();
  if (pos.includes('hooker')) return 'secondary';
  if (pos.includes('prop') || pos.includes('lock') || pos.includes('second row')) return 'primary';
  if (pos.includes('half') || pos.includes('five-eighth') || pos.includes('five eighth')) return 'warning';
  if (pos.includes('centre') || pos.includes('center')) return 'success';
  if (pos.includes('wing') || pos.includes('fullback')) return 'info';
  return 'default';
}

interface PlayersSummaryViewProps {
  players: PlayerSeasonSummary[];
  teams: Team[];
  onPlayerClick: (playerId: string) => void;
  loading?: boolean;
}

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: 'left' | 'right';
  format?: (v: number) => string;
  tip?: string;
}

const fmt0 = (v: number) => Math.round(v).toString();
const fmt1 = (v: number) => v.toFixed(1);

const COLUMNS: ColumnDef[] = [
  { key: 'playerName', label: 'Player', align: 'left' },
  { key: 'teamCode', label: 'Team', align: 'left' },
  { key: 'position', label: 'Position', align: 'left' },
  { key: 'gamesPlayed', label: 'GP', tip: 'Games Played', format: fmt0 },
  { key: 'totalTries', label: 'Tries', format: fmt0 },
  { key: 'totalRunMetres', label: 'Run M', tip: 'Total Run Metres', format: fmt1 },
  { key: 'totalTacklesMade', label: 'Tackles', tip: 'Total Tackles Made', format: fmt0 },
  { key: 'totalPoints', label: 'Points', format: fmt0 },
  { key: 'averageFantasyPoints', label: 'Avg FP', tip: 'Average Fantasy Points', format: fmt1 },
  { key: 'totalTackleBreaks', label: 'TB', tip: 'Total Tackle Breaks', format: fmt0 },
  { key: 'totalLineBreaks', label: 'LB', tip: 'Total Line Breaks', format: fmt0 },
];

export function PlayersSummaryView({
  players,
  teams,
  onPlayerClick,
  loading = false,
}: PlayersSummaryViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('averageFantasyPoints');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [searchText, setSearchText] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [injuredPlayerIds, setInjuredPlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCasualtyWard()
      .then(data => {
        const ids = new Set(
          data.entries
            .filter(e => e.endDate === null && e.playerId !== null)
            .map(e => e.playerId!)
        );
        setInjuredPlayerIds(ids);
      })
      .catch(() => {}); // non-blocking — list still usable without injury data
  }, []);

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) {
      map.set(t.code, t.name);
    }
    return map;
  }, [teams]);

  const positions = useMemo(() => {
    const posSet = new Set(players.map(p => p.position));
    return Array.from(posSet).sort();
  }, [players]);

  const filteredAndSorted = useMemo(() => {
    let result = players;

    // Name search
    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      result = result.filter(p => p.playerName.toLowerCase().includes(query));
    }

    // Team filter
    if (selectedTeam) {
      result = result.filter(p => p.teamCode === selectedTeam);
    }

    // Position filter
    if (selectedPosition) {
      result = result.filter(p => p.position === selectedPosition);
    }

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal);
      const numB = Number(bVal);
      return sortDir === 'asc' ? numA - numB : numB - numA;
    });

    return result;
  }, [players, searchText, selectedTeam, selectedPosition, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'playerName' || key === 'teamCode' || key === 'position' ? 'asc' : 'desc');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Player Season Statistics
      </Typography>

      {/* Filters row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search player..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Team</InputLabel>
          <Select
            value={selectedTeam}
            label="Team"
            onChange={e => setSelectedTeam(e.target.value)}
          >
            <MenuItem value="">All Teams</MenuItem>
            {teams
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(t => (
                <MenuItem key={t.code} value={t.code}>
                  {t.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Position</InputLabel>
          <Select
            value={selectedPosition}
            label="Position"
            onChange={e => setSelectedPosition(e.target.value)}
          >
            <MenuItem value="">All Positions</MenuItem>
            {positions.map(pos => (
              <MenuItem key={pos} value={pos}>
                {pos}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredAndSorted.length} player{filteredAndSorted.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {filteredAndSorted.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No players match the current filters.
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 280px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {COLUMNS.map(col => (
                  <TableCell
                    key={col.key}
                    align={col.align ?? 'right'}
                    sx={{
                      whiteSpace: 'nowrap',
                      px: 1,
                      py: 0.5,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      ...(col.key === 'playerName'
                        ? { position: 'sticky', left: 0, zIndex: 3, bgcolor: 'background.paper' }
                        : {}),
                      ...(col.key === 'averageFantasyPoints'
                        ? { color: 'primary.main', fontWeight: 800 }
                        : {}),
                    }}
                  >
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortKey === col.key ? sortDir : 'desc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.tip ? (
                        <span title={col.tip}>{col.label}</span>
                      ) : (
                        col.label
                      )}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAndSorted.map(player => (
                <TableRow
                  key={player.playerId}
                  sx={{ '&:nth-of-type(odd)': { bgcolor: '#f5f5f5' } }}
                >
                  {COLUMNS.map(col => {
                    const value = player[col.key];
                    const isAvgFP = col.key === 'averageFantasyPoints';

                    if (col.key === 'playerName') {
                      const isInjured = injuredPlayerIds.has(player.playerId);
                      return (
                        <TableCell
                          key={col.key}
                          align="left"
                          sx={{
                            whiteSpace: 'nowrap',
                            px: 1,
                            py: 0.25,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            bgcolor: 'inherit',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Link
                              component="button"
                              variant="body2"
                              onClick={() => onPlayerClick(player.playerId)}
                              sx={{ fontSize: '0.75rem', fontWeight: 500, textAlign: 'left' }}
                            >
                              {String(value)}
                            </Link>
                            {isInjured && (
                              <Tooltip title="Currently on casualty ward" arrow>
                                <Chip
                                  label="INJ"
                                  size="small"
                                  color="error"
                                  sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700, '& .MuiChip-label': { px: 0.5 } }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      );
                    }

                    if (col.key === 'teamCode') {
                      return (
                        <TableCell
                          key={col.key}
                          align="left"
                          sx={{ whiteSpace: 'nowrap', px: 1, py: 0.25, fontSize: '0.75rem' }}
                        >
                          {teamNameMap.get(String(value)) ?? String(value)}
                        </TableCell>
                      );
                    }

                    if (col.key === 'position') {
                      return (
                        <TableCell
                          key={col.key}
                          align="left"
                          sx={{ whiteSpace: 'nowrap', px: 1, py: 0.25 }}
                        >
                          <Chip
                            label={String(value)}
                            size="small"
                            color={positionChipColor(String(value))}
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 20, '& .MuiChip-label': { px: 0.75 } }}
                          />
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell
                        key={col.key}
                        align={col.align ?? 'right'}
                        sx={{
                          whiteSpace: 'nowrap', px: 1, py: 0.25, fontSize: '0.75rem',
                          ...(isAvgFP && { fontWeight: 700, color: 'primary.main' }),
                        }}
                      >
                        {typeof value === 'number' && col.format
                          ? col.format(value)
                          : String(value)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
