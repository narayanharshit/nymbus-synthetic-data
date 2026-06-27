/** Small UI primitives, styled from the design tokens in globals.css. */
import * as React from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "text-[12px] px-2.5 py-1.5", md: "text-[13px] px-3.5 py-2" };
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "bg-surface text-ink border border-line hover:bg-sunken",
    ghost: "text-ink-muted hover:bg-sunken",
    danger: "bg-surface text-fail border border-line hover:bg-fail-bg",
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-line bg-surface", className)} {...rest} />;
}

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: "slate" | "green" | "red" | "amber" | "indigo" | "blue";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    slate: "bg-sunken text-ink-muted",
    green: "bg-pass-bg text-pass",
    red: "bg-fail-bg text-fail",
    amber: "bg-warn-bg text-warn",
    indigo: "bg-accent-weak text-accent",
    blue: "bg-accent-weak text-accent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={cn(inputBase, "tnum", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, "resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputBase, "appearance-none", props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
        checked ? "border-accent/40 bg-accent-weak" : "border-line bg-surface hover:bg-sunken",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <span className="flex flex-col">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {description && <span className="text-[11.5px] text-ink-faint">{description}</span>}
      </span>
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
