'use client';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import ButtonBase from '@mui/material/ButtonBase';

export const ActionControl = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function ActionControl({ type = 'button', ...props }, ref) {
  return <ButtonBase {...props} ref={ref} type={type} disableRipple sx={{ font: 'inherit', '&:focus-visible': { outline: '3px solid var(--brand-text)', outlineOffset: 2 }, '@media (pointer: coarse)': { minHeight: 44, minWidth: 44 } }} />;
});
