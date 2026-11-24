import { describe, expect, it } from "vitest";
import type { CollabStatus } from "../src/lib/collab/provider";
import { describeStatus } from "../src/components/editor/sync-status";
import { safeNextPath, initials } from "../src/lib/utils";

const base: CollabStatus = { connection: "connected", closedReason: null, closedCode: null, synced: true, role: "editor", pending: 0, lastSavedAt: null, editsRejected: false };

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/w/123/members?x=1")).toBe("/w/123/members?x=1");
  });
  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined])("rejects %s", (value) => {
    expect(safeNextPath(value as string | null)).toBe("/");
  });
});

describe("initials", () => {
  it("uses first and last name", () => expect(initials("Ada King Lovelace")).toBe("AL"));
  it("handles single names and blanks", () => {
    expect(initials("Grace")).toBe("G");
    expect(initials("  ")).toBe("?");
  });
});

describe("describeStatus", () => {
  it("only reports Saved once nothing is pending and the server has synced", () => {
    expect(describeStatus(base, false).label).toBe("Saved");
    expect(describeStatus({ ...base, pending: 2 }, false).label).toBe("Saving…");
    expect(describeStatus({ ...base, synced: false }, false).label).toBe("Connecting…");
  });
  it("reports offline with the count of unsynced changes", () => {
    const info = describeStatus({ ...base, connection: "offline", synced: false, pending: 3 }, false);
    expect(info.label).toBe("Offline");
    expect(info.detail).toContain("3 unsynced changes");
  });
  it("prefers the terminal reason and view-only state", () => {
    expect(describeStatus({ ...base, connection: "closed", closedReason: "Your access was removed" }, false).label).toBe("Disconnected");
    expect(describeStatus(base, true).label).toBe("View only");
  });
});
