"use client";

import { useEffect } from "react";
import { useAuth } from "@/stores/auth";

export function AuthBootstrap() {
  const hydrate = useAuth((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return null;
}
