"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { invalidateAccess, keys } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function TitleInput({ documentId, workspaceId, title, editable }: { documentId: string; workspaceId: string; title: string; editable: boolean }) {
  const [value, setValue] = useState(title);
  const client = useQueryClient();
  useEffect(() => setValue(title), [title]);

  async function commit() {
    const next = value.trim();
    if (!next) {
      setValue(title);
      return;
    }
    if (next === title) return;
    try {
      await api(`/documents/${documentId}`, { method: "PATCH", body: { title: next } });
      void client.invalidateQueries({ queryKey: keys.document(documentId) });
      void client.invalidateQueries({ queryKey: keys.documents(workspaceId) });
      invalidateAccess(client);
    } catch (error) {
      setValue(title);
      toast.error(error instanceof Error ? error.message : "Couldn't rename the document");
    }
  }

  return (
    <input
      aria-label="Document title"
      value={value}
      readOnly={!editable}
      maxLength={160}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(title);
          event.currentTarget.blur();
        }
      }}
      className={cn("w-full min-w-0 truncate rounded-md bg-transparent px-1.5 py-0.5 text-lg font-semibold tracking-tight outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring", editable && "hover:bg-muted focus:bg-muted")}
      placeholder="Untitled"
    />
  );
}
