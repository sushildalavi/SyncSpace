"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark" | undefined) ?? "system"}
      position="bottom-right"
      visibleToasts={3}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-border !bg-surface !text-foreground !shadow-md !font-sans !text-sm",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground"
        }
      }}
    />
  );
}
