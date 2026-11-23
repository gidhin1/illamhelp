'use client';
import { type ReactNode } from 'react';

export function SectionHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return <div className="section-header"><div className="stack" style={{ gap: 6 }}>
    {eyebrow && <div className="section-kicker">{eyebrow}</div>}
    <h1 className="display-title">{title}</h1>
    {subtitle && <p className="muted-text" style={{ maxWidth: '48ch' }}>{subtitle}</p>}
  </div>{actions && <div className="section-actions">{actions}</div>}</div>;
}
