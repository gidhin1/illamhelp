'use client';
import { type ReactNode } from 'react';
import Alert from '@mui/material/Alert';

export function Banner({ tone, children }: { tone: 'info' | 'success' | 'error'; children: ReactNode }) {
  return <Alert severity={tone} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} sx={{ borderRadius: 'var(--radius-md)' }}>{children}</Alert>;
}
