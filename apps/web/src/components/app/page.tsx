import { cn } from "@/lib/utils";

export function Page({ children, className, narrow }: { children: React.ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn("mx-auto w-full px-5 py-8 sm:px-8 sm:py-10", narrow ? "max-w-3xl" : "max-w-5xl", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-1.5 text-base text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RoleBadgeLabel(role: "owner" | "editor" | "viewer") {
  return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
}
