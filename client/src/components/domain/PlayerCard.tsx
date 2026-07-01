import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { getTeamPrimary } from '../../utils/teamColors';
import { InjuryStatusChip } from './InjuryStatusChip';
import { SupercoachPositionChips } from './SupercoachPositionChips';
import type { PlayerSeasonSummary } from '../../types';

interface PlayerCardProps {
  player: PlayerSeasonSummary;
  isInjured?: boolean;
}

export function PlayerCard({ player, isInjured }: PlayerCardProps) {
  const navigate = useNavigate();
  const accent = getTeamPrimary(player.teamCode);

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 2, borderTop: `3px solid ${accent}`, height: '100%' }}
    >
      <CardActionArea onClick={() => navigate(`/player/${player.playerId}`)} sx={{ height: '100%', alignItems: 'flex-start' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
              {player.playerName}
            </Typography>
            {isInjured && <InjuryStatusChip status="injured" />}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label={player.teamCode} size="small" variant="outlined" />
            {player.scPosition
              ? <SupercoachPositionChips scPosition={player.scPosition} />
              : (player.position && <Chip label={player.position} size="small" variant="outlined" />)}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            <StatRow label="SC Avg" value={player.averageFantasyPoints?.toFixed(1) ?? '—'} />
            <StatRow label="Games" value={String(player.gamesPlayed)} />
            <StatRow label="Tries" value={String(player.totalTries)} />
            <StatRow label="Run M" value={String(player.totalRunMetres)} />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={600}>{value}</Typography>
    </Box>
  );
}
