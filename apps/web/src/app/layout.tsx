import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "SyncSpace", template: "%s · SyncSpace" },
  description: "Real-time collaborative documents with offline editing, presence and role-based sharing."
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#131110" }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
