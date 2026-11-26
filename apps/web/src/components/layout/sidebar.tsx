"use client";

import { ChevronsUpDown, FileText, Home, Check, Plus, Search, Settings, Star, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdownMenu";
import { Kbd } from "@/components/ui/kbd";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateDocument, useDocuments, useFavorites, useMyInvitations, useWorkspaces } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { UserMenu } from "./userMenu";
import { useCurrentWorkspaceId } from "../../hooks/useCurrentWorkspace";

function NavLink({ href, icon: Icon, children, badge, exact }: { href: string; icon: typeof Home; children: React.ReactNode; badge?: number; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={() => useUi.getState().setMobileNavOpen(false)}
      className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{children}</span>
      {badge ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{badge}</span> : null}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  // not a heading: it would sit above the page's h1 in the outline
  return <p className="px-2.5 pb-1 pt-4 text-xs font-medium text-muted-foreground">{children}</p>;
}

export function SidebarContent({ onCreateWorkspace }: { onCreateWorkspace: () => void }) {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const currentId = useCurrentWorkspaceId();
  const current = workspaces.data?.find((w) => w.id === currentId);
  const documents = useDocuments(currentId ?? "");
  const favorites = useFavorites();
  const favoriteIds = new Set((favorites.data ?? []).map((doc) => doc.id));
  const invitations = useMyInvitations();
  const createDocument = useCreateDocument(currentId ?? "");
  const setLast = useUi((s) => s.setLastWorkspaceId);
  const setPalette = useUi((s) => s.setPaletteOpen);
  const canCreate = current && current.role !== "viewer";

  async function newDocument() {
    try {
      const doc = await createDocument.mutateAsync("Untitled");
      useUi.getState().setMobileNavOpen(false);
      router.push(`/d/${doc.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the document");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center px-3 pb-2 pt-3">
        <Link href="/" aria-label="SyncSpace home" className="rounded-md px-1">
          <Logo />
        </Link>
      </div>

      <div className="px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 text-left shadow-xs transition-colors hover:bg-muted">
              {workspaces.isLoading ? (
                <Skeleton className="h-4 w-28" />
              ) : (
                <>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">{current?.name[0]?.toUpperCase() ?? "?"}</span>
                  <span className="flex-1 truncate text-sm font-medium">{current?.name ?? "No workspace"}<span className="sr-only"> (switch workspace)</span></span>
                </>
              )}
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[15rem]">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.data?.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => {
                  setLast(w.id);
                  useUi.getState().setMobileNavOpen(false);
                  router.push(`/w/${w.id}`);
                }}
              >
                <span className="flex size-5 items-center justify-center rounded-sm bg-primary-soft text-[10px] font-semibold text-primary">{w.name[0]?.toUpperCase()}</span>
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === currentId ? <Check className="!text-primary" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreateWorkspace}>
              <Plus aria-hidden /> Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1 px-2 pt-3">
        <button
          onClick={() => setPalette(true)}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
        {canCreate ? (
          <Button variant="primary" size="sm" className="w-full justify-start" onClick={newDocument} loading={createDocument.isPending}>
            <Plus aria-hidden /> New document
          </Button>
        ) : null}
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="space-y-0.5 pt-3">
          <NavLink href="/" icon={Home} exact badge={invitations.data?.length}>
            Home
          </NavLink>
          {current ? (
            <>
              <NavLink href={`/w/${current.id}`} icon={FileText} exact>
                All documents
              </NavLink>
              <NavLink href={`/w/${current.id}/members`} icon={Users}>
                Members
              </NavLink>
              <NavLink href={`/w/${current.id}/settings`} icon={Settings}>
                Workspace settings
              </NavLink>
            </>
          ) : null}
        </div>

        {favorites.data && favorites.data.length > 0 ? (
          <>
            <SectionLabel>Favorites</SectionLabel>
            <div className="space-y-0.5">
              {favorites.data.slice(0, 6).map((doc) => (
                <NavLink key={doc.id} href={`/d/${doc.id}`} icon={Star}>
                  {doc.title}
                </NavLink>
              ))}
            </div>
          </>
        ) : null}

        {current ? (
          <>
            <SectionLabel>{current.name}</SectionLabel>
            {documents.isLoading ? (
              <div className="space-y-2 px-2.5 pt-1">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : documents.data && documents.data.length > 0 ? (
              <div className="space-y-0.5">
                {documents.data.filter((doc) => !favoriteIds.has(doc.id)).slice(0, 8).map((doc) => (
                  <NavLink key={doc.id} href={`/d/${doc.id}`} icon={FileText}>
                    {doc.title}
                  </NavLink>
                ))}
              </div>
            ) : (
              <p className="px-2.5 text-sm text-muted-foreground">No documents yet.</p>
            )}
          </>
        ) : null}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <UserMenu />
      </div>
    </div>
  );
}
