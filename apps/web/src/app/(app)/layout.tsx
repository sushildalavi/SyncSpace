"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/layout/appShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/authClient";

/** Every page in this group requires a session. The API enforces it too, so this only drives navigation. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = useSession();
  // A failed check (server or database down) is not the same as being signed out.
  const unreachable = !data && Boolean(error) && error!.status !== 401;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !data && !unreachable) {
      const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + window.location.search)}`;
      router.replace(`/sign-in${next}`);
    }
  }, [isPending, data, unreachable, pathname, router]);

  if (unreachable) {
    return (
      <main id="main" className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Can&apos;t reach SyncSpace</h1>
        <p role="alert" className="max-w-sm text-sm text-muted-foreground">The server isn&apos;t answering. You haven&apos;t been signed out.</p>
        <Button variant="primary" onClick={() => void refetch()}>Try again</Button>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="flex h-dvh" aria-busy="true" aria-label="Loading">
        <div className="hidden w-[272px] space-y-3 border-r border-sidebar-border bg-sidebar p-4 lg:block">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-56" />
        </div>
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
