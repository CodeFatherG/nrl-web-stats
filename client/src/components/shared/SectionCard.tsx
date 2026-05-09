import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
  sx?: SxProps<Theme>;
}

export function SectionCard({ title, subtitle, actions, children, noPadding = false, sx }: SectionCardProps) {
  const hasHeader = title || actions;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', ...sx as object }}>
      {hasHeader && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
              gap: 1,
            }}
          >
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
              {subtitle && (
                <Typography variant="caption" color="text.secondary">
                  {subtitle}
                </Typography>
              )}
            </Box>
            {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
          </Box>
          <Divider />
        </>
      )}
      <Box sx={noPadding ? undefined : { p: 2 }}>{children}</Box>
    </Paper>
  );
}
