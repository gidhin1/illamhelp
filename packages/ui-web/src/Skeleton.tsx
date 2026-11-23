'use client';
import MuiSkeleton from '@mui/material/Skeleton';

export function Skeleton({ lines = 1, className }: { lines?: number; className?: string }) {
  return <div className={className} aria-hidden="true">{Array.from({ length: lines }, (_, i) => <MuiSkeleton key={i} width={`${Math.max(42, 92 - i * 18)}%`} sx={{ '@media (prefers-reduced-motion: reduce)': { animation: 'none', '&::after': { animation: 'none' } } }} />)}</div>;
}
