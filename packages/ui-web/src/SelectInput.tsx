'use client';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import OutlinedInput from '@mui/material/OutlinedInput';
import NativeSelect from '@mui/material/NativeSelect';
import { useFieldProps } from './field-context';

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function SelectInput({ children, ...props }, ref) {
  const field = useFieldProps(props);
  return <NativeSelect fullWidth disabled={props.disabled} input={<OutlinedInput inputRef={ref} />} inputProps={{ ...props, ...field }}>{children}</NativeSelect>;
});
