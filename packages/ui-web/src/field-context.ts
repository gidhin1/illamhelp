'use client';
import { createContext, useContext, type InputHTMLAttributes } from 'react';
export const FieldContext = createContext<{ id: string; describedBy?: string; error: boolean } | null>(null);
export function useFieldProps(props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: InputHTMLAttributes<HTMLInputElement>['aria-invalid'] }) {
  const field = useContext(FieldContext);
  return { id: props.id ?? field?.id, 'aria-describedby': [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined, 'aria-invalid': props['aria-invalid'] ?? (field?.error || undefined) };
}
