"use client";

import { Check, CloudOff, Eye, Loader2, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CollabStatus } from "@/lib/collab/provider";
import { cn } from "@/lib/utils";

type Tone = "ok" | "busy" | "warn" | "muted";

export function describeStatus(status: CollabStatus, readOnly: boolean): { label: string; detail?: string; tone: Tone; icon: typeof Check } {
  if (status.closedReason) return { label: "Disconnected", detail: status.closedReason, tone: "warn", icon: CloudOff };
  if (status.connection === "offline") {
    return { label: "Offline", detail: status.pending > 0 ? `${status.pending} unsynced ${status.pending === 1 ? "change is" : "changes are"} saved on this device` : "Changes will sync when you're back online", tone: "warn", icon: WifiOff };
  }
  if (status.connection === "reconnecting") return { label: "Reconnecting…", detail: status.pending > 0 ? `${status.pending} unsynced changes kept safe` : undefined, tone: "warn", icon: Loader2 };
  if (status.connection === "connecting" || !status.synced) return { label: "Connecting…", tone: "busy", icon: Loader2 };
  if (readOnly) return { label: "View only", detail: "You can read this document but not edit it", tone: "muted", icon: Eye };
  if (status.pending > 0) return { label: "Saving…", tone: "busy", icon: Loader2 };
  return { label: "Saved", detail: "All changes are saved", tone: "ok", icon: Check };
}

/**
 * Visible state is "Saved" only after the server acknowledged persistence. The screen-reader
 * announcement is separate and limited to transitions that matter, so typing stays quiet.
 */
export function SyncStatus({ status, readOnly }: { status: CollabStatus; readOnly: boolean }) {
  const info = describeStatus(status, readOnly);
  const Icon = info.icon;
  const [announcement, setAnnouncement] = useState("");
  const previous = useRef<string>("");

  useEffect(() => {
    const key = status.closedReason ? "closed" : status.connection === "connected" && status.synced ? (readOnly ? "viewer" : "online") : status.connection;
    if (key === previous.current) return;
    const first = previous.current === "";
    previous.current = key;
    if (first && key === "online") return;
    setAnnouncement(
      key === "closed" ? (status.closedReason ?? "Disconnected") : key === "offline" ? "You are offline. Changes are saved on this device." : key === "reconnecting" ? "Connection lost. Reconnecting." : key === "viewer" ? "This document is view only." : key === "online" ? "Connected. All changes synced." : ""
    );
  }, [status, readOnly]);

  return (
    <>
      <span
        title={info.detail}
        data-testid="sync-status"
        data-state={info.label}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm",
          info.tone === "ok" && "text-muted-foreground",
          info.tone === "busy" && "text-muted-foreground",
          info.tone === "warn" && "bg-warning-soft text-warning",
          info.tone === "muted" && "bg-muted text-muted-foreground"
        )}
      >
        <Icon className={cn("size-3.5", info.icon === Loader2 && "animate-spin")} aria-hidden />
        <span>{info.label}</span>
      </span>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
