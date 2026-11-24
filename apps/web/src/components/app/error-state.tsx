"use client";

import { FileQuestion, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError } from "@/lib/api";

export function QueryError({ error, retry, what = "this" }: { error: unknown; retry?: () => void; what?: string }) {
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={`We can't find ${what}`}
        description="It may have been deleted, or you may no longer have access."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description={error instanceof Error ? error.message : "We couldn't load this."}
      action={retry ? <Button onClick={retry}>Try again</Button> : null}
    />
  );
}
