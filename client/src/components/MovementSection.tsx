import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface MovementSectionProps {
  title: string;
  count: number;
  defaultExpanded: boolean;
  children: React.ReactNode;
}

export function MovementSection({ title, count, defaultExpanded, children }: MovementSectionProps) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ minHeight: 40, '&.Mui-expanded': { minHeight: 40 }, '& .MuiAccordionSummary-content': { my: 0.75 } }}
      >
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {title}
        </Typography>
        <Chip label={count} size="small" sx={{ ml: 1 }} />
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
