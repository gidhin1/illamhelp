'use client';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import OutlinedInput from '@mui/material/OutlinedInput';
import { useFieldProps } from './field-context';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(props, ref) {
  const field = useFieldProps(props);
  return <OutlinedInput fullWidth multiline rows={props.rows ?? 3} inputRef={ref} disabled={props.disabled} readOnly={props.readOnly} inputProps={{ ...props, ...field }} />;
});
