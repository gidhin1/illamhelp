'use client';
import { forwardRef, type InputHTMLAttributes } from 'react';
import Checkbox from '@mui/material/Checkbox';

export const CheckboxInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function CheckboxInput({ checked, defaultChecked, onChange, disabled, required, ...props }, ref) {
  return <Checkbox checked={checked} defaultChecked={defaultChecked} onChange={onChange} disabled={disabled} required={required} slotProps={{ input: { ...props, ref } }} />;
});
