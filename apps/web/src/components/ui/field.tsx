import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label + control + hint/error wiring. The error is announced to screen readers
 * (role="alert") and tied to the control with aria-describedby.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  labelAction,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  className?: string;
  labelAction?: React.ReactNode;
  children: (aria: { id: string; "aria-invalid": boolean | undefined; "aria-describedby": string | undefined }) => React.ReactNode;
}) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {labelAction}
      </div>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm text-destructive">
      {children}
    </div>
  );
}

export function FormNotice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "success" }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        tone === "success" ? "border-success/30 bg-success-soft text-success" : "border-border bg-muted text-foreground"
      )}
    >
      {children}
    </div>
  );
}
