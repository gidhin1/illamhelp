'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import Paper from '@mui/material/Paper';

type CardVariant = 'record' | 'summary' | 'action' | 'review';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  soft?: boolean;
  motion?: 'none' | 'enter';
  variant?: CardVariant;
  as?: 'div' | 'article' | 'section';
}>(function Card({ as = 'div', children, soft, motion = 'none', variant, className, ...props }, ref) {
  return (
    <Paper
      {...props}
      component={as}
      ref={ref}
      elevation={0}
      data-card-variant={variant}
      className={[motion === 'enter' ? 'motion-enter' : '', className].filter(Boolean).join(' ')}
      sx={{
        p: variant === 'record' || variant === 'summary' ? 'var(--spacing-lg)' : 'var(--spacing-xl)',
        minWidth: 0,
        overflowWrap: 'anywhere',
        borderRadius: variant ? 'var(--radius-md)' : 'var(--radius-lg)',
        backgroundColor: soft ? 'var(--surface-2)' : 'var(--surface)',
        border: '1px solid var(--line)',
        boxShadow: variant || soft ? 'none' : 'var(--shadow)'
      }}
    >
      {children}
    </Paper>
  );
});
