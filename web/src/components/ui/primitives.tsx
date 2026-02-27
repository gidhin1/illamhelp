"use client";

import type {
  ButtonHTMLAttributes,
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
      <div className="stack" style={{ gap: "10px" }}>
        {eyebrow ? <div className="pill">{eyebrow}</div> : null}
        <h1 className="display-title">{title}</h1>
        {subtitle ? <p className="muted-text">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  soft,
  className
}: {
  children: ReactNode;
  soft?: boolean;
  className?: string;
}): JSX.Element {
  return <section className={`card ${soft ? "soft" : ""} ${className ?? ""}`}>{children}</section>;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const className = [
    "button",
    variant === "secondary" ? "secondary" : "",
    variant === "ghost" ? "ghost" : "",
    props.className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...props} className={className}>
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
    <label className="stack field" style={{ gap: "8px" }}>
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
  return <div className={`banner ${tone}`}>{children}</div>;
}

export function EmptyState({
  title,
  body
}: {
  title: string;
  body: string;
}): JSX.Element {
  return (
    <Card soft className="stack" >
      <h3>{title}</h3>
      <p className="muted-text">{body}</p>
    </Card>
  );
}
