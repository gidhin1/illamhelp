'use client';
import type { ReactNode } from 'react';
import MuiDialog from '@mui/material/Dialog';

export function Dialog({ children, open, onClose, titleId }: { children: ReactNode; open: boolean; onClose: () => void; titleId: string }) {
  return <MuiDialog open={open} onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { p: 'var(--spacing-xl)', gap: 'var(--spacing-lg)' } } }}>{children}</MuiDialog>;
}
