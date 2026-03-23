import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Grid,
} from '@mui/material';
import type { TeamListData, TeamListMember } from '../types';

/**
 * Standard NRL positional display order:
 * 1-Fullback, 2-Wing, 3-Centre, 4-Centre, 5-Wing, 6-Five-Eighth,
 * 7-Halfback, 8-Prop, 9-Hooker, 10-Prop, 11-Second Row, 12-Second Row, 13-Lock
 *
 * nrl.com doesn't distinguish left/right for paired positions (Wing, Centre,
 * Prop, Second Row), so within the same position group we sort by jersey number
 * to get the correct 2/5, 3/4, 8/10, 11/12 ordering.
 */
/**
 * NRL positional display order matching nrl.com:
 * Fullback, Winger, Centre, Centre, Winger, Five-Eighth, Halfback,
 * Prop, Hooker, Prop, 2nd Row, 2nd Row, Lock
 *
 * Pairs are interleaved so we need context of all starters to know
 * which winger/centre/prop/2nd-rower is "first" vs "second" by jersey.
 */
const POSITION_GROUP: Record<string, string> = {
  'Fullback': 'Fullback',
  'Wing': 'Winger', 'Winger': 'Winger',
  'Centre': 'Centre',
  'Five-Eighth': 'Five-Eighth', 'Stand-off': 'Five-Eighth',
  'Halfback': 'Halfback',
  'Prop': 'Prop', 'Front Row': 'Prop',
  'Hooker': 'Hooker',
  'Second Row': '2nd Row', '2nd Row': '2nd Row',
  'Lock': 'Lock',
};

// Slot assignments for paired positions: [firstByJersey, secondByJersey]
const PAIRED_SLOTS: Record<string, [number, number]> = {
  'Winger':  [2, 5],   // first winger before centres, second after
  'Centre':  [3, 4],
  'Prop':    [8, 10],   // first prop before hooker, second after
  '2nd Row': [11, 12],
};

const SINGLE_SLOTS: Record<string, number> = {
  'Fullback': 1,
  'Five-Eighth': 6,
  'Halfback': 7,
  'Hooker': 9,
  'Lock': 13,
};

function assignSlots(starters: TeamListMember[]): Map<TeamListMember, number> {
  const slots = new Map<TeamListMember, number>();

  // Group starters by normalised position
  const groups = new Map<string, TeamListMember[]>();
  for (const m of starters) {
    const group = POSITION_GROUP[m.position] ?? m.position;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(m);
  }

  for (const [group, members] of groups) {
    if (SINGLE_SLOTS[group] !== undefined) {
      for (const m of members) slots.set(m, SINGLE_SLOTS[group]);
    } else if (PAIRED_SLOTS[group]) {
      const sorted = [...members].sort((a, b) => a.jerseyNumber - b.jerseyNumber);
      const [first, second] = PAIRED_SLOTS[group];
      sorted.forEach((m, i) => slots.set(m, i === 0 ? first : second));
    } else {
      for (const m of members) slots.set(m, 50 + m.jerseyNumber);
    }
  }

  return slots;
}

function sortStarters(starters: TeamListMember[]): TeamListMember[] {
  const slots = assignSlots(starters);
  return [...starters].sort((a, b) => (slots.get(a) ?? 99) - (slots.get(b) ?? 99));
}

interface TeamListSectionProps {
  teamList: TeamListData;
  teamName: string;
  teamCode: string;
  onPlayerClick?: (playerId: string) => void;
}

function TeamListSection({ teamList, teamName, teamCode, onPlayerClick }: TeamListSectionProps) {
  const starters = sortStarters(
    teamList.members.filter(m => m.position !== 'Interchange' && m.position !== 'Reserve')
  );
  const interchange = teamList.members
    .filter(m => m.position === 'Interchange')
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);
  const reserves = teamList.members
    .filter(m => m.position === 'Reserve')
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

  return (
    <Paper sx={{ p: 2, flex: 1, minWidth: 280 }}>
      <Box display="flex" alignItems="center" gap={1} mb={1.5}>
        <Typography variant="subtitle1" fontWeight={700}>
          {teamName}
        </Typography>
        <Chip label={teamCode} size="small" variant="outlined" />
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 40 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Player</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Position</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {starters.map(member => (
              <TableRow key={member.jerseyNumber} hover>
                <TableCell>{member.jerseyNumber}</TableCell>
                <TableCell>
                  {onPlayerClick ? (
                    <Typography
                      component="span"
                      sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => onPlayerClick(String(member.playerId))}
                    >
                      {member.playerName}
                    </Typography>
                  ) : (
                    member.playerName
                  )}
                </TableCell>
                <TableCell>{member.position}</TableCell>
              </TableRow>
            ))}
            {interchange.length > 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ py: 0.5, bgcolor: 'grey.50' }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    Interchange
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {interchange.map(member => (
              <TableRow key={member.jerseyNumber} hover sx={{ bgcolor: 'grey.50' }}>
                <TableCell>{member.jerseyNumber}</TableCell>
                <TableCell>
                  {onPlayerClick ? (
                    <Typography
                      component="span"
                      sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => onPlayerClick(String(member.playerId))}
                    >
                      {member.playerName}
                    </Typography>
                  ) : (
                    member.playerName
                  )}
                </TableCell>
                <TableCell>{member.position}</TableCell>
              </TableRow>
            ))}
            {reserves.length > 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ py: 0.5, bgcolor: 'grey.100' }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    Reserves
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {reserves.map(member => (
              <TableRow key={member.jerseyNumber} hover sx={{ bgcolor: 'grey.100' }}>
                <TableCell>{member.jerseyNumber}</TableCell>
                <TableCell>
                  {onPlayerClick ? (
                    <Typography
                      component="span"
                      sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => onPlayerClick(String(member.playerId))}
                    >
                      {member.playerName}
                    </Typography>
                  ) : (
                    member.playerName
                  )}
                </TableCell>
                <TableCell>{member.position}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

interface TeamListDisplayProps {
  homeTeamList: TeamListData | null;
  awayTeamList: TeamListData | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode: string;
  onPlayerClick?: (playerId: string) => void;
}

export function TeamListDisplay({
  homeTeamList,
  awayTeamList,
  homeTeamName,
  awayTeamName,
  homeTeamCode,
  awayTeamCode,
  onPlayerClick,
}: TeamListDisplayProps) {
  if (!homeTeamList && !awayTeamList) return null;

  return (
    <Box sx={{ mt: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Team Lists
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          {homeTeamList && (
            <TeamListSection
              teamList={homeTeamList}
              teamName={homeTeamName}
              teamCode={homeTeamCode}
              onPlayerClick={onPlayerClick}
            />
          )}
        </Grid>
        <Grid item xs={12} md={6}>
          {awayTeamList && (
            <TeamListSection
              teamList={awayTeamList}
              teamName={awayTeamName}
              teamCode={awayTeamCode}
              onPlayerClick={onPlayerClick}
            />
          )}
        </Grid>
      </Grid>
      {(homeTeamList || awayTeamList) && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Last updated: {new Date((homeTeamList ?? awayTeamList)!.scrapedAt).toLocaleString()}
        </Typography>
      )}
    </Box>
  );
}
