"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
] as const;

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <section aria-labelledby="theme-heading" className="space-y-4">
      <div>
        <h2 id="theme-heading" className="text-lg font-semibold">Theme</h2>
        <p className="text-sm text-muted-foreground">Saved in this browser. &quot;System&quot; follows your operating system.</p>
      </div>
      <div role="radiogroup" aria-labelledby="theme-heading" className="grid gap-3 sm:grid-cols-3">
        {options.map(({ value, label, icon: Icon }) => {
          const selected = mounted && theme === value;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={cn("flex items-center gap-3 rounded-lg border bg-surface p-4 text-left shadow-xs transition-colors", selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30")}
            >
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
