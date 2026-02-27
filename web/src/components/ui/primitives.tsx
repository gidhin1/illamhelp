"use client";

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: any;
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
  children: any;
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
  children: any;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (event: any) => void;
}): JSX.Element {
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
  children: any;
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

interface BaseTextInputProps {
  className?: string;
  value?: any;
  onChange?: (event: any) => void;
  [key: string]: any;
}

export function TextInput(props: BaseTextInputProps): JSX.Element {
  return <input {...props} className={["input", props.className ?? ""].join(" ")} />;
}

export function TextArea(props: BaseTextInputProps): JSX.Element {
  return <textarea {...props} className={["input textarea", props.className ?? ""].join(" ")} />;
}

export function SelectInput(props: BaseTextInputProps): JSX.Element {
  return <select {...props} className={["input", props.className ?? ""].join(" ")} />;
}

export function Banner({
  tone,
  children
}: {
  tone: "info" | "success" | "error";
  children: any;
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
