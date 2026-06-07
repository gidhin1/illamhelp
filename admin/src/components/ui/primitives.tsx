"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { useEffect, useRef } from "react";

import { animateElement } from "../../lib/motion";

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
}): React.JSX.Element {
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
  className,
  motion = "none",
  ...props
}: {
  children: ReactNode;
  soft?: boolean;
  className?: string;
  motion?: "none" | "enter";
} & HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <section {...props} className={`card ${soft ? "soft" : ""} ${motion === "enter" ? "motion-enter" : ""} ${className ?? ""}`}>
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const className = [
    "button",
    "motion-press",
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
}): React.JSX.Element {
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

export function TextInput(props: TextInputProps): React.JSX.Element {
  return <input {...props} className={["input", props.className ?? ""].join(" ")} />;
}

export function TextArea(props: TextAreaProps): React.JSX.Element {
  return <textarea {...props} className={["input textarea", props.className ?? ""].join(" ")} />;
}

export function SelectInput(props: SelectInputProps): React.JSX.Element {
  return <select {...props} className={["input", props.className ?? ""].join(" ")} />;
}

export function Banner({
  tone,
  children
}: {
  tone: "info" | "success" | "error";
  children: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const animation = animateElement(ref.current, "bannerIn");
    return () => animation?.cancel();
  }, [children, tone]);

  return (
    <div ref={ref} className={`banner motion-banner ${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body
}: {
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <Card soft motion="enter" className="stack">
      <h3>{title}</h3>
      <p className="muted-text">{body}</p>
    </Card>
  );
}
