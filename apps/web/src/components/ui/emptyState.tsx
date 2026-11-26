import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** `heading` is "h1" when this is all there is on the page, so the page still has a main heading. */
export function EmptyState({ icon: Icon, title, description, action, className, heading: Heading = "h2" }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string; heading?: "h1" | "h2" }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <Heading className="text-base font-semibold">{title}</Heading>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
