"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={150}>
    {children}
  </TooltipPrimitive.Provider>
);

/** Wraps a single focusable child. The tooltip is also exposed to keyboard users on focus. */
export function Tooltip({ label, shortcut, side = "bottom", children }: { label: string; shortcut?: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactElement }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 flex items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md duration-fast data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0"
          )}
        >
          {label}
          {shortcut ? <kbd className="font-sans text-[11px] opacity-70">{shortcut}</kbd> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
