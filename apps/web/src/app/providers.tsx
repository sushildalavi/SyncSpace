"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthBootstrap } from "@/components/auth-bootstrap";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <AuthBootstrap />
      {children}
    </QueryClientProvider>
  );
}
