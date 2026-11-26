"use client";

import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import type { RemoteUser } from "@/lib/collab/use-remote-users";

export function PresenceAvatars({ users, self }: { users: RemoteUser[]; self: { name: string; color: string; image?: string | null } }) {
  const shown = users.slice(0, 4);
  const extra = users.length - shown.length;
  return (
    <ul aria-label={users.length === 0 ? "1 person here" : `${users.length + 1} people here`} className="flex items-center gap-1.5" data-testid="presence">
      <li>
        <Tooltip label="You"><span className="inline-flex"><Avatar name={self.name} src={self.image ?? null} size="sm" color={self.color} /></span></Tooltip>
      </li>
      {shown.map((user) => (
        <li key={user.userId}>
          <Tooltip label={user.status === "idle" ? `${user.name} (away)` : user.name}>
            <span className="inline-flex" style={{ opacity: user.status === "idle" ? 0.55 : 1 }}>
              <Avatar name={user.name} size="sm" color={user.color} />
            </span>
          </Tooltip>
        </li>
      ))}
      {extra > 0 ? (
        <li aria-label={`${extra} more`} className="relative z-10 flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">+{extra}</li>
      ) : null}
    </ul>
  );
}
