"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="section-header">
      <div className="stack" style={{ gap: "6px" }}>
        {eyebrow ? <div className="section-kicker">{eyebrow}</div> : null}
        <h1 className="display-title" style={{ marginTop: eyebrow ? "4px" : 0 }}>{title}</h1>
        {subtitle ? <p className="muted-text" style={{ maxWidth: "48ch" }}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  soft,
  className,
  ...props
}: {
  children: ReactNode;
  soft?: boolean;
  className?: string;
} & HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div {...props} className={`card ${soft ? "soft" : ""} ${className ?? ""}`}>{children}</div>;
}

export function Button({
  children,
  variant = "primary",
  loading,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const className = [
    "button",
    variant === "secondary" ? "secondary" : "",
    variant === "ghost" ? "ghost" : "",
    variant === "danger" ? "danger" : "",
    loading ? "loading" : "",
    props.className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...props} className={className} disabled={props.disabled || loading} aria-busy={loading || undefined}>
      {loading ? <span className="button-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;
type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement>;

export function TextInput(props: TextInputProps): JSX.Element {
  return <input {...props} className={["input", props.className ?? ""].join(" ")} />;
}

export function TextArea(props: TextAreaProps): JSX.Element {
  return <textarea {...props} className={["input textarea", props.className ?? ""].join(" ")} />;
}

export function SelectInput(props: SelectInputProps): JSX.Element {
  return <select {...props} className={["input", props.className ?? ""].join(" ")} />;
}

export function Banner({
  tone,
  children
}: {
  tone: "info" | "success" | "error";
  children: ReactNode;
}): JSX.Element {
  const ariaRole = tone === "error" ? "alert" : "status";
  return <div className={`banner ${tone}`} role={ariaRole} aria-live={tone === "error" ? "assertive" : "polite"}>{children}</div>;
}

export function StatusLabel({
  tone = "info",
  children
}: {
  tone?: "info" | "success" | "warning" | "error" | "neutral";
  children: ReactNode;
}): JSX.Element {
  return <span className={`status-label ${tone}`}>{children}</span>;
}

export function Skeleton({
  lines = 1,
  className
}: {
  lines?: number;
  className?: string;
}): JSX.Element {
  return (
    <div className={["skeleton-stack", className ?? ""].filter(Boolean).join(" ")} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} className="skeleton-line" style={{ width: `${Math.max(42, 92 - index * 18)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <Card soft>
      <div style={{ padding: "var(--spacing-lg) var(--spacing-md)" }}>
        <h3 style={{ marginBottom: "6px" }}>{title}</h3>
        <p className="muted-text">{body}</p>
        {action ? <div style={{ marginTop: "var(--spacing-md)" }}>{action}</div> : null}
      </div>
    </Card>
  );
}

export const ActionEmptyState = EmptyState;
