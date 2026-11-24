"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  sidebarCollapsed: boolean;
  lastWorkspaceId: string | null;
  mobileNavOpen: boolean;
  paletteOpen: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  setLastWorkspaceId: (id: string | null) => void;
  setMobileNavOpen: (value: boolean) => void;
  setPaletteOpen: (value: boolean) => void;
};

/** Purely presentational preferences. Nothing sensitive is stored here. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      lastWorkspaceId: null,
      mobileNavOpen: false,
      paletteOpen: false,
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setLastWorkspaceId: (id) => set({ lastWorkspaceId: id }),
      setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
      setPaletteOpen: (value) => set({ paletteOpen: value })
    }),
    { name: "syncspace-ui", partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, lastWorkspaceId: state.lastWorkspaceId }) }
  )
);
