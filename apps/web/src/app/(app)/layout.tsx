"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";

/** Every page in this group requires a session. The API enforces it too, so this only drives navigation. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !data) {
      const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + window.location.search)}`;
      router.replace(`/sign-in${next}`);
    }
  }, [isPending, data, pathname, router]);

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
