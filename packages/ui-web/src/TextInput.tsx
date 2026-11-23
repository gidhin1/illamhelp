'use client';
import { forwardRef, type InputHTMLAttributes } from 'react';
import OutlinedInput from '@mui/material/OutlinedInput';
import { useFieldProps } from './field-context';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
  const field = useFieldProps(props);
  return <OutlinedInput fullWidth inputRef={ref} disabled={props.disabled} readOnly={props.readOnly} type={props.type} inputProps={{ ...props, ...field }} />;
});
