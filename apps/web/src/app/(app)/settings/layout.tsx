"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/app/page";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/appearance", label: "Appearance" }
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = tabs.find((tab) => (tab.href === "/settings" ? pathname === "/settings" : pathname.startsWith(tab.href)));
  return (
    <Page narrow>
      <PageHeader title="Account settings" documentTitle={current ? `${current.label} settings` : "Account settings"} />
      <nav aria-label="Settings" className="-mt-2 mb-8 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const active = tab.href === "/settings" ? pathname === "/settings" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </Page>
  );
}
