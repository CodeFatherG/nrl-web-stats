import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import type { TeamListData } from '../../types';

interface TeamListPanelProps {
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  homeList: TeamListData | null;
  awayList: TeamListData | null;
}

function TeamColumn({
  teamName,
  list,
}: {
  teamName: string;
  list: TeamListData | null;
}) {
  const navigate = useNavigate();
  const starters = list?.members.filter(m => m.jerseyNumber <= 13) ?? [];
  const interchange = list?.members.filter(m => m.jerseyNumber >= 14 && m.jerseyNumber <= 17) ?? [];

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        {teamName}
      </Typography>
      {!list ? (
        <Typography variant="caption" color="text.secondary">Team list not yet available</Typography>
      ) : (
        <>
          {starters.map(m => (
            <Box key={m.jerseyNumber} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 20, textAlign: 'right' }}>
                {m.jerseyNumber}
              </Typography>
              <Link
                component="button"
                variant="caption"
                onClick={() => navigate(`/player/${m.playerId}`)}
                sx={{ textAlign: 'left' }}
              >
                {m.playerName}
              </Link>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {m.position}
              </Typography>
            </Box>
          ))}
          {interchange.length > 0 && (
            <>
              <Divider sx={{ my: 0.75 }}>
                <Typography variant="caption" color="text.secondary">Interchange</Typography>
              </Divider>
              {interchange.map(m => (
                <Box key={m.jerseyNumber} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 20, textAlign: 'right' }}>
                    {m.jerseyNumber}
                  </Typography>
                  <Link
                    component="button"
                    variant="caption"
                    onClick={() => navigate(`/player/${m.playerId}`)}
                    sx={{ textAlign: 'left' }}
                  >
                    {m.playerName}
                  </Link>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {m.position}
                  </Typography>
                </Box>
              ))}
            </>
          )}
          {list.scrapedAt && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              Scraped: {new Date(list.scrapedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

export function TeamListPanel({ homeTeamName, awayTeamName, homeList, awayList }: TeamListPanelProps) {
  if (!homeList && !awayList) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Chip label="Team lists not yet available" variant="outlined" />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' }, p: 1 }}>
      <TeamColumn teamName={homeTeamName} list={homeList} />
      <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
      <Divider sx={{ display: { xs: 'block', md: 'none' } }} />
      <TeamColumn teamName={awayTeamName} list={awayList} />
    </Box>
  );
}
