import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useAppContext } from '../hooks/useAppContext';
import { useSupercoachQuery } from '../hooks/useSupercoachQuery';
import { useSeasonSummaryQuery } from '../hooks/useSeasonQuery';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';

type ScoreRow = {
  playerId: string;
  playerName: string;
  teamCode: string;
  totalScore: number;
  isComplete: boolean;
  scoring: number;
  create: number;
  evade: number;
  base: number;
  defence: number;
  negative: number;
};

const COLUMNS = [
  { key: 'playerName', label: 'Player', sticky: true, align: 'left' as const, sortable: true,
    getValue: (r: ScoreRow) => r.playerName,
    renderCell: (r: ScoreRow) => <Typography variant="caption" fontWeight={600}>{r.playerName}</Typography> },
  { key: 'teamCode', label: 'Team', align: 'center' as const,
    renderCell: (r: ScoreRow) => <Typography variant="caption">{r.teamCode}</Typography> },
  { key: 'totalScore', label: 'SC', align: 'right' as const, sortable: true,
    getValue: (r: ScoreRow) => r.totalScore,
    renderCell: (r: ScoreRow) => <Typography variant="caption" fontWeight={700}>{r.totalScore}</Typography> },
  { key: 'scoring', label: 'Score', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (r: ScoreRow) => r.scoring,
    renderCell: (r: ScoreRow) => <Typography variant="caption">{r.scoring.toFixed(0)}</Typography> },
  { key: 'create', label: 'Create', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (r: ScoreRow) => r.create,
    renderCell: (r: ScoreRow) => <Typography variant="caption">{r.create.toFixed(0)}</Typography> },
  { key: 'evade', label: 'Evade', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (r: ScoreRow) => r.evade,
    renderCell: (r: ScoreRow) => <Typography variant="caption">{r.evade.toFixed(0)}</Typography> },
  { key: 'base', label: 'Base', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (r: ScoreRow) => r.base,
    renderCell: (r: ScoreRow) => <Typography variant="caption">{r.base.toFixed(0)}</Typography> },
  { key: 'defence', label: 'Def', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (r: ScoreRow) => r.defence,
    renderCell: (r: ScoreRow) => <Typography variant="caption">{r.defence.toFixed(0)}</Typography> },
  { key: 'negative', label: 'Neg', align: 'right' as const, sortable: true, hideOnMobile: true,
    getValue: (r: ScoreRow) => r.negative,
    renderCell: (r: ScoreRow) => <Typography variant="caption" color="error.main">{r.negative.toFixed(0)}</Typography> },
];

export function SupercoachView() {
  const { n } = useParams<{ n?: string }>();
  const { currentYear, teams } = useAppContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const year = Number(searchParams.get('year') ?? currentYear);
  const [teamFilter, setTeamFilter] = useState('');

  const seasonQuery = useSeasonSummaryQuery(year);

  const derivedRound = useMemo(() => {
    if (n) return Number(n);
    if (!seasonQuery.data) return 0;
    const withLists = seasonQuery.data.rounds.filter(r => r.hasTeamLists);
    if (withLists.length > 0) return withLists[withLists.length - 1]?.round ?? 1;
    const completed = seasonQuery.data.rounds.filter(r => r.matches.some(m => m.isComplete));
    return completed[completed.length - 1]?.round ?? 1;
  }, [n, seasonQuery.data]);

  useEffect(() => {
    if (!n && derivedRound > 0) {
      navigate(`/supercoach/${derivedRound}`, { replace: true });
    }
  }, [n, derivedRound, navigate]);

  const scQuery = useSupercoachQuery(year, derivedRound);

  const maxRound = seasonQuery.data?.rounds.length ?? 27;

  const rows = useMemo<ScoreRow[]>(() => {
    const all: ScoreRow[] = [];
    for (const match of scQuery.data?.matches ?? []) {
      for (const player of [...match.homeTeam.players, ...match.awayTeam.players]) {
        if (teamFilter && player.teamCode !== teamFilter) continue;
        all.push({
          playerId: player.playerId,
          playerName: player.playerName,
          teamCode: player.teamCode,
          totalScore: player.totalScore,
          isComplete: player.isComplete,
          scoring: player.categoryTotals.scoring,
          create: player.categoryTotals.create,
          evade: player.categoryTotals.evade,
          base: player.categoryTotals.base,
          defence: player.categoryTotals.defence,
          negative: player.categoryTotals.negative,
        });
      }
    }
    return all;
  }, [scQuery.data, teamFilter]);

  if (!n && derivedRound === 0) return <SkeletonPage variant="table" />;

  const stepper = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton onClick={() => navigate(`/supercoach/${derivedRound - 1}`)} disabled={derivedRound <= 1} size="small">
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="body2" fontWeight={600} sx={{ minWidth: 64, textAlign: 'center' }}>
        Round {derivedRound}
      </Typography>
      <IconButton onClick={() => navigate(`/supercoach/${derivedRound + 1}`)} disabled={derivedRound >= maxRound} size="small">
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );

  return (
    <Box>
      <PageHeader title="Supercoach Scores" subtitle={`${year} Season`} actions={stepper} />

      {!scQuery.data?.isComplete && scQuery.data && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Round {derivedRound} is not yet complete — scores may be partial.
        </Alert>
      )}

      {/* Team filter chips */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2, overflowX: 'auto', pb: 0.5,
        '::-webkit-scrollbar': { display: 'none' } }}>
        <Chip
          label="All"
          size="small"
          variant={teamFilter === '' ? 'filled' : 'outlined'}
          color={teamFilter === '' ? 'primary' : 'default'}
          onClick={() => setTeamFilter('')}
        />
        {teams.map(t => (
          <Chip
            key={t.code}
            label={t.code}
            size="small"
            variant={teamFilter === t.code ? 'filled' : 'outlined'}
            color={teamFilter === t.code ? 'primary' : 'default'}
            onClick={() => setTeamFilter(t.code === teamFilter ? '' : t.code)}
          />
        ))}
      </Box>

      <SectionCard>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowKey={r => r.playerId}
          stickyHeader
          maxHeight="70vh"
          defaultSortKey="totalScore"
          defaultSortDir="desc"
          emptyMessage={scQuery.isLoading ? 'Loading…' : 'No scores available.'}
          onRowClick={r => navigate(`/player/${r.playerId}`)}
        />
      </SectionCard>
    </Box>
  );
}
