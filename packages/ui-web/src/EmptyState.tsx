'use client';
import { type ReactNode } from 'react';
import { Card } from './Card';

export function EmptyState({ title, body, action, headingLevel = 3 }: { title: string; body: string; action?: ReactNode; headingLevel?: 2 | 3 | 4 }) {
  const Heading = `h${headingLevel}` as const;
  return <Card soft><Heading>{title}</Heading><p className="muted-text">{body}</p>{action && <div style={{ marginTop: 'var(--spacing-md)' }}>{action}</div>}</Card>;
}
