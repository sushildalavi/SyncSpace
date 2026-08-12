"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/stores/auth";
import { useCollaboration } from "@/hooks/use-collaboration";

export function CollaborativeEditor({ documentId, workspaceId }: { documentId: string; workspaceId: string }) {
  const { token } = useAuth();
  const user = useAuth((state) => state.user);
  const { text, setText, connectionState, presence, currentVersion, reconnect } = useCollaboration({
    documentId,
    workspaceId,
    token,
    actorId: user?.id ?? ""
  });
  const [localText, setLocalText] = useState(text);

  useEffect(() => {
    setLocalText(text);
  }, [text]);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-glow">
        <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
          <span>{connectionState}</span>
          <span>Version {currentVersion}</span>
        </div>
        <textarea
          className="min-h-[65vh] w-full rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-base leading-7 text-slate-100 outline-none"
          value={localText}
          onChange={(event) => {
            setLocalText(event.target.value);
            setText(event.target.value);
          }}
          placeholder="Start editing..."
        />
        {connectionState !== "connected" ? (
          <button className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 font-medium text-slate-950" onClick={reconnect}>
            Reconnect
          </button>
        ) : null}
      </div>

      <aside className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-white">Presence</h2>
        <div className="mt-4 space-y-3">
          {presence.map((item) => (
            <div key={item.userId} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
              <p className="text-sm font-medium text-white">{item.userName}</p>
              <p className="text-xs text-slate-400">{item.status}</p>
              {item.cursor ? (
                <p className="mt-2 text-xs text-cyan-200">
                  Cursor {item.cursor.anchor} - {item.cursor.head}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
