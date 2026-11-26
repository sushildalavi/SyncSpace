"use client";

import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { FileText, FolderPlus, Home, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreateDocument, useRecent, useSearch, useWorkspaces } from "@/lib/queries";
import { useUi } from "@/stores/ui";
import { useCurrentWorkspaceId } from "@/hooks/useCurrentWorkspaceId";

const itemClass =
  "flex cursor-default select-none items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const headingClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

export function CommandPalette({ onCreateWorkspace }: { onCreateWorkspace: () => void }) {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const workspaceId = useCurrentWorkspaceId();
  const workspaces = useWorkspaces();
  const recent = useRecent();
  const results = useSearch(query);
  const createDocument = useCreateDocument(workspaceId ?? "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const documents = query.trim() ? (results.data ?? []) : (recent.data ?? []);
  const canCreate = Boolean(workspaceId) && workspaces.data?.find((w) => w.id === workspaceId)?.role !== "viewer";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg duration-base data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>Command menu</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          <Command shouldFilter={false} label="Command menu" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Search documents or run a command…" className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
            </div>
            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                {results.isFetching ? "Searching…" : `No documents match "${query}".`}
              </Command.Empty>

              {documents.length > 0 ? (
                <Command.Group heading={query.trim() ? "Documents" : "Recent"} className={headingClass}>
                  {documents.map((doc) => (
                    <Command.Item key={doc.id} value={`doc-${doc.id}`} onSelect={() => go(`/d/${doc.id}`)} className={itemClass}>
                      <FileText aria-hidden />
                      <span className="flex-1 truncate">{doc.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{doc.workspaceName}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {!query.trim() ? (
                <>
                  <Command.Group heading="Actions" className={headingClass}>
                    {canCreate ? (
                      <Command.Item
                        value="new-document"
                        onSelect={async () => {
                          try {
                            const doc = await createDocument.mutateAsync("Untitled");
                            go(`/d/${doc.id}`);
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Couldn't create the document");
                          }
                        }}
                        className={itemClass}
                      >
                        <Plus aria-hidden /> New document
                      </Command.Item>
                    ) : null}
                    <Command.Item value="new-workspace" onSelect={() => { setOpen(false); onCreateWorkspace(); }} className={itemClass}>
                      <FolderPlus aria-hidden /> Create workspace
                    </Command.Item>
                    <Command.Item value="home" onSelect={() => go("/")} className={itemClass}>
                      <Home aria-hidden /> Go to home
                    </Command.Item>
                    <Command.Item value="settings" onSelect={() => go("/settings")} className={itemClass}>
                      <Settings aria-hidden /> Account settings
                    </Command.Item>
                    <Command.Item value="theme" onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); setOpen(false); }} className={itemClass}>
                      {resolvedTheme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />} Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
                    </Command.Item>
                  </Command.Group>
                  {workspaces.data && workspaces.data.length > 0 ? (
                    <Command.Group heading="Workspaces" className={headingClass}>
                      {workspaces.data.map((w) => (
                        <Command.Item key={w.id} value={`ws-${w.id}`} onSelect={() => go(`/w/${w.id}`)} className={itemClass}>
                          <span className="flex size-4 items-center justify-center rounded-sm bg-primary-soft text-[10px] font-semibold text-primary">{w.name[0]?.toUpperCase()}</span>
                          {w.name}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                </>
              ) : null}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

