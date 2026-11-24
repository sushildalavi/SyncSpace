import { cn } from "@/lib/utils";

/** Two overlapping page corners: a shared document with two authors. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden fill="none">
      <rect x="2" y="2" width="20" height="20" rx="6" className="fill-primary/25" />
      <rect x="10" y="10" width="20" height="20" rx="6" className="fill-primary" />
      <path d="M16 20.5h8M16 24.5h5" stroke="hsl(var(--primary-foreground))" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-lg">SyncSpace</span>
    </span>
  );
}
