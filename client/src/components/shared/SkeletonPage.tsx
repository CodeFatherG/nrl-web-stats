import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';

type SkeletonVariant = 'table' | 'cards' | 'match-list' | 'player-header';

interface SkeletonPageProps {
  variant?: SkeletonVariant;
}

function TableSkeleton() {
  return (
    <Box>
      <Skeleton variant="rectangular" height={40} sx={{ mb: 0.5, borderRadius: 1 }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} variant="rectangular" height={36} sx={{ mb: 0.5, opacity: 1 - i * 0.08 }} />
      ))}
    </Box>
  );
}

function CardsSkeleton() {
  return (
    <Grid container spacing={2}>
      {Array.from({ length: 9 }).map((_, i) => (
        <Grid item xs={12} sm={6} md={4} key={i}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="40%" height={20} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

function MatchListSkeleton() {
  return (
    <Grid container spacing={2}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Grid item xs={12} sm={6} md={4} key={i}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Skeleton variant="text" width="70%" height={20} sx={{ mb: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Skeleton variant="text" width="35%" height={32} />
              <Skeleton variant="text" width="20%" height={40} />
              <Skeleton variant="text" width="35%" height={32} />
            </Box>
            <Skeleton variant="text" width="50%" height={20} />
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

function PlayerHeaderSkeleton() {
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <Skeleton variant="circular" width={64} height={64} />
        <Box sx={{ flexGrow: 1 }}>
          <Skeleton variant="text" width="40%" height={36} />
          <Skeleton variant="text" width="25%" height={24} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" width={100} height={60} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
      <TableSkeleton />
    </Box>
  );
}

export function SkeletonPage({ variant = 'table' }: SkeletonPageProps) {
  switch (variant) {
    case 'cards': return <CardsSkeleton />;
    case 'match-list': return <MatchListSkeleton />;
    case 'player-header': return <PlayerHeaderSkeleton />;
    default: return <TableSkeleton />;
  }
}
