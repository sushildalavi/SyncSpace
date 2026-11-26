"use client";

import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-surface p-1 text-foreground shadow-md duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <MenuPrimitive.Item ref={ref} className={cn(itemClass, destructive && "text-destructive data-[highlighted]:bg-destructive-soft [&_svg]:text-destructive", className)} {...props} />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.RadioItem ref={ref} className={cn(itemClass, "pr-8", className)} {...props}>
    {children}
    <MenuPrimitive.ItemIndicator className="absolute right-2.5">
      <Check className="size-4 text-primary" aria-hidden />
    </MenuPrimitive.ItemIndicator>
  </MenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>>(
  ({ className, ...props }, ref) => <MenuPrimitive.Label ref={ref} className={cn("px-2.5 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />
);
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>>(
  ({ className, ...props }, ref) => <MenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
