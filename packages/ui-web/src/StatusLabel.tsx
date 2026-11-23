'use client';
import { type ReactNode } from 'react';
import Chip from '@mui/material/Chip';

export function StatusLabel({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'error' | 'neutral'; children: ReactNode }) {
  return (
    <Chip
      component="span"
      size="small"
      label={children}
      color={tone === 'neutral' ? 'default' : tone}
      variant="outlined"
      sx={{
        height: 'auto',
        minHeight: 24,
        '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', paddingBlock: '2px' },
      }}
    />
  );
}
