"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Menu, PanelLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { useWorkspaces } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { CommandPalette } from "./commandPalette";
import { CreateWorkspaceDialog } from "../workspace/createWorkspaceDialog";
import { SidebarContent } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setCollapsed = useUi((s) => s.setSidebarCollapsed);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobileOpen = useUi((s) => s.setMobileNavOpen);
  const [creating, setCreating] = useState(false);
  const params = useParams<{ workspaceId?: string }>();
  const setLast = useUi((s) => s.setLastWorkspaceId);
  const workspaces = useWorkspaces();

  // Remember the workspace being viewed, but only once the server confirmed membership.
  useEffect(() => {
    if (params.workspaceId && workspaces.data?.some((w) => w.id === params.workspaceId)) setLast(params.workspaceId);
  }, [params.workspaceId, workspaces.data, setLast]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={cn("hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-slow ease-out lg:block", collapsed ? "w-0 overflow-hidden border-r-0" : "w-[272px]")}
        inert={collapsed || undefined}
      >
        <div className="h-full w-[272px]">
          <SidebarContent onCreateWorkspace={() => setCreating(true)} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-3rem))] border-r border-sidebar-border bg-sidebar shadow-lg duration-base data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden"
          >
            <VisuallyHidden.Root>
              <DialogPrimitive.Title>Navigation</DialogPrimitive.Title>
            </VisuallyHidden.Root>
            <SidebarContent onCreateWorkspace={() => { setMobileOpen(false); setCreating(true); }} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: mobile menu + desktop sidebar toggle */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 lg:border-b-0 lg:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu aria-hidden />
          </Button>
          <Tooltip label={collapsed ? "Show sidebar" : "Hide sidebar"} side="right">
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
              <PanelLeft aria-hidden />
            </Button>
          </Tooltip>
          <span className="lg:hidden"><Logo className="[&_span]:text-base" /></span>
          <div id="shell-toolbar" className="ml-auto flex min-w-0 items-center gap-2" />
        </div>
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
          {children}
        </main>
      </div>

      <CommandPalette onCreateWorkspace={() => setCreating(true)} />
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
