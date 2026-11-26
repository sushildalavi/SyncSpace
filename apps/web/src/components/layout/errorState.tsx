"use client";

import { FileQuestion, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/emptyState";
import { ApiError } from "@/lib/api";
import { usePageTitle } from "@/hooks/usePageTitle";

export function QueryError({ error, retry, what = "this", heading }: { error: unknown; retry?: () => void; what?: string; heading?: "h1" | "h2" }) {
  const missing = error instanceof ApiError && (error.status === 404 || error.status === 403);
  usePageTitle(heading === "h1" ? (missing ? "Not found" : "Something went wrong") : null);
  if (missing) {
    return (
      <EmptyState
        heading={heading ?? "h2"}
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
      heading={heading ?? "h2"}
      icon={TriangleAlert}
      title="Something went wrong"
      description={error instanceof Error ? error.message : "We couldn't load this."}
      action={retry ? <Button onClick={retry}>Try again</Button> : null}
    />
  );
}
