'use client';
import { Children, cloneElement, isValidElement, useId, type ReactNode, type ReactElement, type InputHTMLAttributes } from 'react';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import FormHelperText from '@mui/material/FormHelperText';
import { FieldContext } from './field-context';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  const generatedId = useId();
  const control = Children.toArray(children).find(child => isValidElement<{ id?: string }>(child) && child.props.id);
  const id = isValidElement<{ id?: string }>(control) ? control.props.id ?? generatedId : generatedId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <FieldContext.Provider value={{ id, describedBy, error: !!error }}>
    <FormControl className="field" fullWidth error={!!error} sx={{ gap: 'var(--spacing-sm)' }}>
      <FormLabel htmlFor={id} sx={{ color: 'var(--ink)', fontWeight: 600 }}>{label}</FormLabel>
      {Children.map(children, child => isValidElement(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type)
        ? cloneElement(child as ReactElement<InputHTMLAttributes<HTMLInputElement>>, { id, 'aria-describedby': describedBy, 'aria-invalid': !!error || undefined }) : child)}
      {hint && <FormHelperText id={`${id}-hint`} sx={{ m: 0 }}>{hint}</FormHelperText>}
      {error && <FormHelperText id={`${id}-error`} role="alert" sx={{ m: 0 }}>{error}</FormHelperText>}
    </FormControl>
  </FieldContext.Provider>;
}
