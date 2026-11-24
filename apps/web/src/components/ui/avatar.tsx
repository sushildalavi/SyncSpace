"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, initials } from "@/lib/utils";

const sizes = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-12 text-base", xl: "size-16 text-xl" } as const;

export function Avatar({
  name,
  src,
  size = "md",
  color,
  className
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  /** Presence colour: drawn as a ring so it stays distinguishable without relying on hue alone. */
  color?: string;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative inline-flex shrink-0 select-none overflow-hidden rounded-full bg-muted align-middle font-semibold text-muted-foreground", sizes[size], color && "ring-2 ring-offset-2 ring-offset-background", className)}
      style={color ? ({ ["--tw-ring-color" as string]: color } as React.CSSProperties) : undefined}
      title={name}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : null}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center" delayMs={src ? 400 : 0} aria-hidden>
        {initials(name)}
      </AvatarPrimitive.Fallback>
      <span className="sr-only">{name}</span>
    </AvatarPrimitive.Root>
  );
}
