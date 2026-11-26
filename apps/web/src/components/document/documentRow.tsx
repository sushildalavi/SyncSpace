"use client";

import { FileText, Star } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToggleFavorite } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";

export function DocumentRow({ id, title, updatedAt, meta, isFavorite }: { id: string; title: string; updatedAt?: string; meta?: string; isFavorite?: boolean }) {
  const toggle = useToggleFavorite();
  return (
    <li className="group flex items-center gap-1 border-b border-border last:border-b-0">
      <Link href={`/d/${id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-base font-medium">{title}</span>
        {meta ? <span className="hidden truncate text-sm text-muted-foreground sm:block">{meta}</span> : null}
        {updatedAt ? <span className="shrink-0 text-sm text-muted-foreground">{timeAgo(updatedAt)}</span> : null}
      </Link>
      {isFavorite !== undefined ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="mr-2"
          aria-label={isFavorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
          aria-pressed={isFavorite}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ id, favorite: !isFavorite })}
        >
          <Star className={cn(isFavorite ? "fill-warning text-warning" : "text-muted-foreground")} aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

export function DocumentList({ children }: { children: React.ReactNode }) {
  return <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">{children}</ul>;
}
