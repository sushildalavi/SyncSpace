"use client";

import { create } from "zustand";

type User = { id: string; email: string; displayName: string };

type AuthState = {
  token: string | null;
  user: User | null;
  hydrate: () => void;
  setSession: (token: string, user: User) => void;
  logout: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrate: () => {
    if (typeof window === "undefined") {
      return;
    }
    const token = window.localStorage.getItem("syncspace-token");
    const userRaw = window.localStorage.getItem("syncspace-user");
    if (!token || !userRaw) {
      return;
    }
    set({ token, user: JSON.parse(userRaw) as User });
  },
  setSession: (token, user) => {
    window.localStorage.setItem("syncspace-token", token);
    window.localStorage.setItem("syncspace-user", JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    window.localStorage.removeItem("syncspace-token");
    window.localStorage.removeItem("syncspace-user");
    set({ token: null, user: null });
  }
}));
