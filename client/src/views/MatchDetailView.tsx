import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useState, useMemo } from 'react';
import { useMatchDetailQuery, useMatchSupercoachQuery } from '../hooks/useMatchQuery';
import { useAllRankingsQuery } from '../hooks/useTeamQuery';
import { useGameStrengthQuery } from '../hooks/useRoundQuery';
import { isGSRAvailable } from '../services/api';
import { PageHeader } from '../components/shared/PageHeader';
import { SectionCard } from '../components/shared/SectionCard';
import { DataTable } from '../components/shared/DataTable';
import { SkeletonPage } from '../components/shared/SkeletonPage';
import { TeamListPanel } from '../components/domain/TeamListPanel';
import { StrengthBadge } from '../components/StrengthBadge';
import { GSRBadge } from '../components/GSRBadge';
import { formatMatchDate } from '../utils/formatMatchDate';
import { useAppContext } from '../hooks/useAppContext';
import type { PlayerMatchStats } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const pct = (v: number) => v.toFixed(1);
const dec = (v: number) => v.toFixed(1);

function sum(rows: PlayerMatchStats[], key: keyof PlayerMatchStats): number {
  return rows.reduce((s, p) => s + ((p[key] as number) || 0), 0);
}

function col(
  key: keyof PlayerMatchStats,
  label: string,
  groupLabel: string,
  opts: { format?: (v: number) => string } = {}
) {
  return {
    key: key as string,
    label,
    groupLabel,
    align: 'right' as const,
    sortable: true,
    getValue: (p: PlayerMatchStats) => p[key] as number | null,
    format: opts.format,
  };
}

// ─── stat columns (all 65) ──────────────────────────────────────────────────

function makeStatColumns(scScores: Map<string, number>) {
  return [
  {
    key: 'playerName', label: 'Player', groupLabel: 'Player',
    sticky: true, align: 'left' as const, sortable: true,
    getValue: (p: PlayerMatchStats) => p.playerName,
    renderCell: (p: PlayerMatchStats) => (
      <Typography variant="inherit" fontWeight={600} noWrap sx={{ maxWidth: 130 }}>{p.playerName}</Typography>
    ),
  },
  { key: 'position', label: 'Pos', groupLabel: 'Player', align: 'center' as const, sortable: false,
    getValue: (p: PlayerMatchStats) => p.position },
  {
    key: 'fantasyPointsTotal', label: 'SC', groupLabel: 'Base',
    align: 'right' as const, sortable: true,
    getValue: (p: PlayerMatchStats) => scScores.get(p.playerId) ?? p.fantasyPointsTotal,
    renderCell: (p: PlayerMatchStats) => {
      const score = scScores.get(p.playerId) ?? p.fantasyPointsTotal;
      return <Typography variant="inherit" fontWeight={700}>{score}</Typography>;
    },
  },
  col('minutesPlayed', 'Mins', 'Base'),
  col('stintOne', 'S1', 'Base'),
  col('tries', 'T', 'Scoring'),
  col('tryAssists', 'TA', 'Scoring'),
  col('goals', 'G', 'Scoring'),
  col('goalConversionRate', 'G%', 'Scoring', { format: pct }),
  col('conversions', 'Conv', 'Scoring'),
  col('conversionAttempts', 'ConvA', 'Scoring'),
  col('penaltyGoals', 'PG', 'Scoring'),
  col('fieldGoals', 'FG', 'Scoring'),
  col('onePointFieldGoals', '1FG', 'Scoring'),
  col('twoPointFieldGoals', '2FG', 'Scoring'),
  col('points', 'Pts', 'Scoring'),
  col('allRuns', 'Runs', 'Running'),
  col('allRunMetres', 'RunM', 'Running'),
  col('hitUps', 'HU', 'Running'),
  col('hitUpRunMetres', 'HUM', 'Running'),
  col('lineEngagedRuns', 'LE', 'Running'),
  col('postContactMetres', 'PCM', 'Running'),
  col('lineBreaks', 'LB', 'Running'),
  col('lineBreakAssists', 'LBA', 'Running'),
  col('tackleBreaks', 'TB', 'Running'),
  col('offloads', 'Off', 'Running'),
  col('dummyHalfRuns', 'DH', 'Running'),
  col('dummyHalfRunMetres', 'DHM', 'Running'),
  col('receipts', 'Rec', 'Passing'),
  col('passes', 'Pass', 'Passing'),
  col('passesToRunRatio', 'P:R', 'Passing', { format: dec }),
  col('dummyPasses', 'DP', 'Passing'),
  col('kicks', 'K', 'Kicking'),
  col('kickMetres', 'KM', 'Kicking'),
  col('kickReturnMetres', 'KRM', 'Kicking'),
  col('kicksDefused', 'KD', 'Kicking'),
  col('kicksDead', 'Dead', 'Kicking'),
  col('bombKicks', 'BK', 'Kicking'),
  col('grubberKicks', 'GK', 'Kicking'),
  col('crossFieldKicks', 'XK', 'Kicking'),
  col('forcedDropOutKicks', 'FDO', 'Kicking'),
  col('fortyTwentyKicks', '40/20', 'Kicking'),
  col('twentyFortyKicks', '20/40', 'Kicking'),
  col('tacklesMade', 'Tkl', 'Defence'),
  col('missedTackles', 'MT', 'Defence'),
  col('ineffectiveTackles', 'IT', 'Defence'),
  col('tackleEfficiency', 'TE%', 'Defence', { format: pct }),
  col('intercepts', 'Int', 'Defence'),
  col('oneOnOneSteal', '1v1W', 'Defence'),
  col('oneOnOneLost', '1v1L', 'Defence'),
  col('errors', 'Err', 'Errors'),
  col('handlingErrors', 'HE', 'Errors'),
  col('penalties', 'Pen', 'Errors'),
  col('ruckInfringements', 'RI', 'Errors'),
  col('offsideWithinTenMetres', 'OS', 'Errors'),
  col('onReport', 'OR', 'Errors'),
  col('sinBins', 'SB', 'Errors'),
  col('sendOffs', 'SO', 'Errors'),
  col('playTheBallTotal', 'PTB', 'PTB'),
  col('playTheBallAverageSpeed', 'PTBSpd', 'PTB', { format: dec }),
  col('lastTouch', 'LT', 'Supp'),
  col('missedGoals', 'MG', 'Supp'),
  col('missedFieldGoals', 'MFG', 'Supp'),
  col('effectiveOffloads', 'EO', 'Supp'),
  col('ineffectiveOffloads', 'IO', 'Supp'),
  col('runsOver8m', 'R8+', 'Supp'),
  col('runsUnder8m', 'R<8', 'Supp'),
  col('trySaves', 'TS', 'Supp'),
  col('kickRegatherBreak', 'KRB', 'Supp'),
  col('heldUpInGoal', 'HIG', 'Supp'),
  col('price', 'Price', 'Supp'),
  col('breakEven', 'BE', 'Supp'),
  ];
}

// ─── overview sub-components ────────────────────────────────────────────────

function StatRow({ label, home, away }: { label: string; home: number | string; away: number | string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 56, textAlign: 'right' }}>{home}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'center' }}>{label}</Typography>
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 56 }}>{away}</Typography>
    </Box>
  );
}

function ScoringPanel({ stats }: { stats: PlayerMatchStats[] }) {
  const tryers = stats.filter(p => p.tries > 0).sort((a, b) => b.tries - a.tries);
  const kickers = stats.filter(p => p.conversionAttempts > 0);
  const pgScorers = stats.filter(p => p.penaltyGoals > 0);
  const fgScorers = stats.filter(p => p.fieldGoals > 0);
  const sinBinned = stats.filter(p => p.sinBins > 0);
  const sentOff = stats.filter(p => p.sendOffs > 0);

  const section = (heading: string, children: React.ReactNode) => (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 0.25, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
        {heading}
      </Typography>
      {children}
    </Box>
  );

  return (
    <Box>
      {section('Tries',
        tryers.length === 0
          ? <Typography variant="caption" color="text.disabled">None</Typography>
          : tryers.map(p => (
            <Box key={p.playerId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption">{p.playerName}</Typography>
              {p.tries > 1 && <Chip label={`×${p.tries}`} size="small" sx={{ height: 16, fontSize: '0.65rem' }} />}
            </Box>
          ))
      )}
      {kickers.length > 0 && section('Goals',
        kickers.map(p => (
          <Typography key={p.playerId} variant="caption" sx={{ display: 'block' }}>
            {p.playerName} {p.conversions}/{p.conversionAttempts}
          </Typography>
        ))
      )}
      {pgScorers.length > 0 && section('Penalty Goals',
        pgScorers.map(p => (
          <Typography key={p.playerId} variant="caption" sx={{ display: 'block' }}>
            {p.playerName} ×{p.penaltyGoals}
          </Typography>
        ))
      )}
      {fgScorers.length > 0 && section('Field Goals',
        fgScorers.map(p => (
          <Typography key={p.playerId} variant="caption" sx={{ display: 'block' }}>
            {p.playerName} ×{p.fieldGoals}
          </Typography>
        ))
      )}
      {(sinBinned.length > 0 || sentOff.length > 0) && section('Discipline', <>
        {sinBinned.map(p => (
          <Typography key={p.playerId} variant="caption" color="warning.main" sx={{ display: 'block' }}>
            Sin bin: {p.playerName}
          </Typography>
        ))}
        {sentOff.map(p => (
          <Typography key={p.playerId} variant="caption" color="error.main" sx={{ display: 'block' }}>
            Sent off: {p.playerName}
          </Typography>
        ))}
      </>)}
    </Box>
  );
}

function TopScorers({ stats, scScores }: { stats: PlayerMatchStats[]; scScores: Map<string, number> }) {
  const top5 = [...stats]
    .sort((a, b) => (scScores.get(b.playerId) ?? b.fantasyPointsTotal) - (scScores.get(a.playerId) ?? a.fantasyPointsTotal))
    .slice(0, 5);
  return (
    <Box>
      {top5.map((p, i) => {
        const score = scScores.get(p.playerId) ?? p.fantasyPointsTotal;
        return (
          <Box key={p.playerId} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4 }}>
            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 14, textAlign: 'right' }}>{i + 1}</Typography>
            <Typography variant="caption" sx={{ flexGrow: 1 }}>{p.playerName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28, textAlign: 'right', fontSize: '0.65rem' }}>{p.position}</Typography>
            <Typography variant="caption" fontWeight={700} sx={{ minWidth: 32, textAlign: 'right' }}>{score}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function StatsTable({ title, rows, scScores }: { title: string; rows: PlayerMatchStats[]; scScores: Map<string, number> }) {
  const columns = makeStatColumns(scScores);
  return (
    <SectionCard title={title}>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={p => p.playerId}
        stickyHeader
        maxHeight="70vh"
        defaultSortKey="fantasyPointsTotal"
        defaultSortDir="desc"
        dense
        emptyMessage="No player stats available."
      />
    </SectionCard>
  );
}

// ─── main view ──────────────────────────────────────────────────────────────

export function MatchDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentYear } = useAppContext();
  const year = Number(searchParams.get('year') ?? currentYear);
  const [tab, setTab] = useState(0);

  const matchQuery = useMatchDetailQuery(id ?? '');
  const rankingsQuery = useAllRankingsQuery(year);
  const thresholds = rankingsQuery.data?.thresholds ?? { p33: 300, p67: 400, lowerFence: 0.1, upperFence: 0.9 };

  const matchYear = matchQuery.data?.year ?? year;
  const matchRound = matchQuery.data?.round ?? 0;
  const scQuery = useMatchSupercoachQuery(matchYear, id ?? '');
  const gsrQuery = useGameStrengthQuery(matchYear, matchRound);

  const matchGSR = useMemo(() => {
    if (!gsrQuery.data || !matchQuery.data) return null;
    if (!isGSRAvailable(gsrQuery.data)) return null;
    return gsrQuery.data.matches.find(
      m => m.homeTeam.teamCode === matchQuery.data!.homeTeamCode && m.awayTeam.teamCode === matchQuery.data!.awayTeamCode
    ) ?? null;
  }, [gsrQuery.data, matchQuery.data]);

  const scScores = useMemo(() => {
    const map = new Map<string, number>();
    const sc = scQuery.data;
    if (!sc) return map;
    for (const p of sc.homeTeam.players) map.set(p.playerId, p.totalScore);
    for (const p of sc.awayTeam.players) map.set(p.playerId, p.totalScore);
    return map;
  }, [scQuery.data]);

  if (matchQuery.isLoading) return <SkeletonPage variant="table" />;
  if (matchQuery.isError || !matchQuery.data) return (
    <Alert severity="error">Match not found or failed to load.</Alert>
  );

  const m = matchQuery.data;
  const isComplete = m.status === 'Completed';
  const hs = m.homePlayerStats;
  const as_ = m.awayPlayerStats;

  const scoreDisplay = isComplete && m.homeScore != null && m.awayScore != null
    ? `${m.homeScore} – ${m.awayScore}`
    : 'vs';

  return (
    <Box>
      <PageHeader
        title={`${m.homeTeamName} vs ${m.awayTeamName}`}
        subtitle={`Round ${m.round}, ${m.year}${m.scheduledTime ? ` · ${formatMatchDate(m.scheduledTime)}` : ''}`}
        actions={
          <IconButton onClick={() => navigate(-1)} size="small">
            <ArrowBackIcon />
          </IconButton>
        }
      />

      {/* Match hero */}
      <SectionCard sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ textAlign: 'right', flex: 1 }}>
            <Typography variant="h6" fontWeight={700}>{m.homeTeamName}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, flexWrap: 'wrap' }}>
              {m.homeStrengthRating != null && <StrengthBadge rating={m.homeStrengthRating} thresholds={thresholds} showValue />}
              {matchGSR && <GSRBadge normalizedGSR={matchGSR.homeTeam.normalizedOverallGSR} sampleSizeWarning={matchGSR.homeTeam.sampleSizeWarning} />}
            </Box>
          </Box>
          <Box sx={{ textAlign: 'center', minWidth: 80 }}>
            <Typography variant={isComplete ? 'h4' : 'h5'} fontWeight={700}>{scoreDisplay}</Typography>
            {isComplete && <Chip label="FT" size="small" sx={{ mt: 0.5 }} />}
            {!isComplete && m.status === 'InProgress' && <Chip label="LIVE" color="error" size="small" sx={{ mt: 0.5 }} />}
          </Box>
          <Box sx={{ textAlign: 'left', flex: 1 }}>
            <Typography variant="h6" fontWeight={700}>{m.awayTeamName}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 0.5, flexWrap: 'wrap' }}>
              {m.awayStrengthRating != null && <StrengthBadge rating={m.awayStrengthRating} thresholds={thresholds} showValue />}
              {matchGSR && <GSRBadge normalizedGSR={matchGSR.awayTeam.normalizedOverallGSR} sampleSizeWarning={matchGSR.awayTeam.sampleSizeWarning} />}
            </Box>
          </Box>
        </Box>
        {(m.stadium || m.weather) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
            {[m.stadium, m.weather].filter(Boolean).join(' · ')}
          </Typography>
        )}
      </SectionCard>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Overview" />
        <Tab label={`${m.homeTeamCode} Stats`} />
        <Tab label={`${m.awayTeamCode} Stats`} />
        <Tab label="Team Lists" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Team stat comparison */}
          <SectionCard>
            <Box sx={{ display: 'flex', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={700} sx={{ minWidth: 56, textAlign: 'right' }}>{m.homeTeamCode}</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" fontWeight={700} sx={{ minWidth: 56 }}>{m.awayTeamCode}</Typography>
            </Box>
            <Divider sx={{ mb: 0.5 }} />
            <StatRow label="Tries" home={sum(hs, 'tries')} away={sum(as_, 'tries')} />
            <StatRow label="Run Metres" home={sum(hs, 'allRunMetres')} away={sum(as_, 'allRunMetres')} />
            <StatRow label="Tackles" home={sum(hs, 'tacklesMade')} away={sum(as_, 'tacklesMade')} />
            <StatRow label="Missed Tackles" home={sum(hs, 'missedTackles')} away={sum(as_, 'missedTackles')} />
            <StatRow label="Line Breaks" home={sum(hs, 'lineBreaks')} away={sum(as_, 'lineBreaks')} />
            <StatRow label="Kick Metres" home={sum(hs, 'kickMetres')} away={sum(as_, 'kickMetres')} />
            <StatRow label="Errors" home={sum(hs, 'errors')} away={sum(as_, 'errors')} />
            <StatRow label="Penalties" home={sum(hs, 'penalties')} away={sum(as_, 'penalties')} />
          </SectionCard>

          {/* Scoring events */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <SectionCard title={`${m.homeTeamName} Scoring`}>
              <ScoringPanel stats={hs} />
            </SectionCard>
            <SectionCard title={`${m.awayTeamName} Scoring`}>
              <ScoringPanel stats={as_} />
            </SectionCard>
          </Box>

          {/* Top SC scorers */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <SectionCard title={`${m.homeTeamName} Top SC`}>
              <TopScorers stats={hs} scScores={scScores} />
            </SectionCard>
            <SectionCard title={`${m.awayTeamName} Top SC`}>
              <TopScorers stats={as_} scScores={scScores} />
            </SectionCard>
          </Box>
        </Box>
      )}

      {tab === 1 && <StatsTable title={`${m.homeTeamName} Player Stats`} rows={hs} scScores={scScores} />}
      {tab === 2 && <StatsTable title={`${m.awayTeamName} Player Stats`} rows={as_} scScores={scScores} />}

      {tab === 3 && (
        <SectionCard title="Team Lists">
          <TeamListPanel
            homeTeamCode={m.homeTeamCode}
            awayTeamCode={m.awayTeamCode}
            homeTeamName={m.homeTeamName}
            awayTeamName={m.awayTeamName}
            homeList={m.homeTeamList}
            awayList={m.awayTeamList}
          />
        </SectionCard>
      )}
    </Box>
  );
}
