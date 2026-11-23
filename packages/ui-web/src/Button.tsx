'use client';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import MuiButton from '@mui/material/Button';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }>(function Button({ variant = 'primary', loading, disabled, children, type = 'submit', ...props }, ref) {
  return <MuiButton {...props} ref={ref} type={type} variant={variant === 'ghost' ? 'text' : variant === 'secondary' ? 'outlined' : 'contained'} color={variant === 'danger' ? 'error' : 'primary'} loading={loading} disabled={disabled || loading} aria-busy={loading || undefined}>{children}</MuiButton>;
});
