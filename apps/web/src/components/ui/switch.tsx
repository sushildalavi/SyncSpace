"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors duration-fast data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-fast data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
);
Switch.displayName = "Switch";
