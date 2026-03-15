import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const CATEGORY_ORDER = ['scoring', 'create', 'evade', 'base', 'defence', 'negative'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  scoring: 'Scoring',
  create: 'Create',
  evade: 'Evade',
  base: 'Base',
  defence: 'Defence',
  negative: 'Negative',
};

interface StatContribution {
  statName: string;
  displayName: string;
  rawValue: number;
  pointsPerUnit: number;
  contribution: number;
}

interface CategoryBreakdownProps {
  categories: Record<string, StatContribution[]>;
  categoryTotals: Record<string, number>;
  isComplete: boolean;
}

export function CategoryBreakdown({ categories, categoryTotals, isComplete }: CategoryBreakdownProps) {
  return (
    <Box sx={{ mt: 1 }}>
      {!isComplete && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
          Partial data — supplementary stats not yet available. Some categories may be incomplete.
        </Typography>
      )}
      {CATEGORY_ORDER.map(cat => {
        const stats = categories[cat] ?? [];
        const total = categoryTotals[cat] ?? 0;
        const hasContributions = stats.some(s => s.contribution !== 0);

        return (
          <Accordion
            key={cat}
            defaultExpanded={hasContributions}
            disableGutters
            sx={{ '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </Typography>
                <Chip
                  label={total > 0 ? `+${total}` : String(total)}
                  size="small"
                  color={total < 0 ? 'error' : total > 0 ? 'primary' : 'default'}
                  variant="outlined"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {stats.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  No stats in this category
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Stat</TableCell>
                        <TableCell align="right">Value</TableCell>
                        <TableCell align="right">Pts/Unit</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats
                        .filter(s => s.rawValue !== 0 || s.contribution !== 0)
                        .map(stat => (
                          <TableRow key={stat.statName}>
                            <TableCell>{stat.displayName}</TableCell>
                            <TableCell align="right">{stat.rawValue}</TableCell>
                            <TableCell align="right">{stat.pointsPerUnit}</TableCell>
                            <TableCell
                              align="right"
                              sx={{ color: stat.contribution < 0 ? 'error.main' : undefined, fontWeight: 'bold' }}
                            >
                              {stat.contribution > 0 ? `+${stat.contribution}` : stat.contribution}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
