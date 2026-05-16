import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme, useMediaQuery } from '@mui/material';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TableRowsIcon from '@mui/icons-material/TableRows';
import GridViewIcon from '@mui/icons-material/GridView';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { useAppContext } from '../hooks/useAppContext';
import { useSeasonPlayersQuery } from '../hooks/useSeasonQuery';
import { useCasualtyWardQuery } from '../hooks/useCasualtyWardQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { PlayerCard } from '../components/domain/PlayerCard';
import type { PlayerSeasonSummary } from '../types';

type ViewMode = 'table' | 'cards';

const COLUMNS = [
  { key: 'playerName', label: 'Player', sticky: true, align: 'left' as const, sortable: true,
    getValue: (p: PlayerSeasonSummary) => p.playerName,
    renderCell: (p: PlayerSeasonSummary) => <Typography variant="caption" fontWeight={600}>{p.playerName}</Typography> },
  { key: 'teamCode', label: 'Team', align: 'center' as const, sortable: true,
    getValue: (p: PlayerSeasonSummary) => p.teamCode,
    renderCell: (p: PlayerSeasonSummary) => <Typography variant="caption">{p.teamCode}</Typography> },
  { key: 'position', label: 'Pos', align: 'center' as const, hideOnMobile: true,
    renderCell: (p: PlayerSeasonSummary) => <Typography variant="caption">{p.position}</Typography> },
  { key: 'averageFantasyPoints', label: 'SC Avg', align: 'right' as const, sortable: true,
    getValue: (p: PlayerSeasonSummary) => p.averageFantasyPoints ?? 0,
    renderCell: (p: PlayerSeasonSummary) => (
      <Typography variant="caption" fontWeight={600}>
        {p.averageFantasyPoints != null ? p.averageFantasyPoints.toFixed(1) : '—'}
      </Typography>
    ) },
  { key: 'totalTries', label: 'Tries', align: 'right' as const, sortable: true,
    getValue: (p: PlayerSeasonSummary) => p.totalTries,
    renderCell: (p: PlayerSeasonSummary) => <Typography variant="caption">{p.totalTries}</Typography> },
  { key: 'totalRunMetres', label: 'Run M', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (p: PlayerSeasonSummary) => p.totalRunMetres,
    renderCell: (p: PlayerSeasonSummary) => <Typography variant="caption">{p.totalRunMetres}</Typography> },
  { key: 'totalTackleBreaks', label: 'TB', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (p: PlayerSeasonSummary) => p.totalTackleBreaks,
    renderCell: (p: PlayerSeasonSummary) => <Typography variant="caption">{p.totalTackleBreaks}</Typography> },
];

export function PlayersView() {
  const { currentYear, teams } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(searchParams.get('year') ?? currentYear);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'cards' : 'table');
  const [searchText, setSearchText] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');

  const playersQuery = useSeasonPlayersQuery(year);
  const casualtyQuery = useCasualtyWardQuery();

  const injuredIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of casualtyQuery.data?.entries ?? []) {
      if (e.playerId) set.add(e.playerId);
    }
    return set;
  }, [casualtyQuery.data]);

  const positions = useMemo(() => {
    const set = new Set<string>();
    for (const p of playersQuery.data?.players ?? []) {
      if (p.position) set.add(p.position);
    }
    return Array.from(set).sort();
  }, [playersQuery.data]);

  const filtered = useMemo(() => {
    return (playersQuery.data?.players ?? []).filter(p => {
      if (searchText && !p.playerName.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (selectedTeam && p.teamCode !== selectedTeam) return false;
      if (selectedPosition && p.position !== selectedPosition) return false;
      return true;
    });
  }, [playersQuery.data, searchText, selectedTeam, selectedPosition]);

  if (playersQuery.isLoading) return <SkeletonPage variant="cards" />;
  if (playersQuery.isError) return <Alert severity="error">Failed to load players.</Alert>;

  const viewToggle = (
    <ToggleButtonGroup
      value={viewMode}
      exclusive
      onChange={(_, v) => v && setViewMode(v)}
      size="small"
    >
      <ToggleButton value="table"><TableRowsIcon fontSize="small" /></ToggleButton>
      <ToggleButton value="cards"><GridViewIcon fontSize="small" /></ToggleButton>
    </ToggleButtonGroup>
  );

  return (
    <Box>
      <PageHeader
        title="Players"
        subtitle={`${filtered.length} of ${playersQuery.data?.players.length ?? 0} players`}
        actions={viewToggle}
      />

      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search player…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <TextField
          select
          size="small"
          label="Team"
          value={selectedTeam}
          onChange={e => setSelectedTeam(e.target.value)}
          sx={{ minWidth: 100 }}
        >
          <MenuItem value="">All Teams</MenuItem>
          {teams.map(t => (
            <MenuItem key={t.code} value={t.code}>{t.code}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Position"
          value={selectedPosition}
          onChange={e => setSelectedPosition(e.target.value)}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">All Positions</MenuItem>
          {positions.map(pos => (
            <MenuItem key={pos} value={pos}>{pos}</MenuItem>
          ))}
        </TextField>
      </Box>

      {viewMode === 'table' ? (
        <SectionCard>
          <DataTable
            columns={COLUMNS}
            rows={filtered}
            getRowKey={p => p.playerId}
            stickyHeader
            maxHeight="70vh"
            onRowClick={p => navigate(`/player/${p.playerId}`)}
            defaultSortKey="averageFantasyPoints"
            defaultSortDir="desc"
            emptyMessage="No players match the current filters."
          />
        </SectionCard>
      ) : (
        <Grid container spacing={2}>
          {filtered.map(p => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={p.playerId}>
              <PlayerCard player={p} isInjured={injuredIds.has(p.playerId)} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
