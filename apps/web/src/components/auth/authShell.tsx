import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

const points = ["Edit together in real time, with live cursors", "Keep writing offline. Changes sync when you're back", "Share with owner, editor and viewer roles"];

export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between border-r border-border bg-sidebar p-12 lg:flex">
        <Link href="/" aria-label="SyncSpace home">
          <Logo />
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold">A calm place to write together.</h2>
          <ul className="mt-8 space-y-4">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-base text-muted-foreground">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">Built with Yjs, NestJS, PostgreSQL and Next.js.</p>
      </aside>

      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="mb-10 lg:hidden" aria-label="SyncSpace home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-12">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? <p className="mt-2 text-base text-muted-foreground">{description}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="relative my-6 flex items-center" role="separator" aria-label="or">
      <div className="h-px flex-1 bg-border" />
      <span className="px-3 text-xs uppercase tracking-wide text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
