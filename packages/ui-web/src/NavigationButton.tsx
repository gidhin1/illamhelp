'use client';
import { forwardRef, type AnchorHTMLAttributes, type ElementType } from 'react';
import MuiButton from '@mui/material/Button';

export const NavigationButton = forwardRef<HTMLAnchorElement, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'color'> & { component?: ElementType; variant?: 'primary' | 'secondary' | 'ghost' }>(function NavigationButton({ component = 'a', variant = 'primary', ...props }, ref) {
  return <MuiButton {...props} component={component} ref={ref} variant={variant === 'ghost' ? 'text' : variant === 'secondary' ? 'outlined' : 'contained'} />;
});
