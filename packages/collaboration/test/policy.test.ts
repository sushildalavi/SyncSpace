import { describe, expect, it } from "vitest";
import { isDuplicateUpdate, recordUpdate, shouldCreateSnapshot } from "../src/policy.js";

describe("collaboration policy", () => {
  it("decides when to snapshot", () => {
    expect(shouldCreateSnapshot(25, 25)).toBe(true);
    expect(shouldCreateSnapshot(24, 25)).toBe(false);
  });

  it("tracks duplicate update ids", () => {
    const seen = new Set<string>();
    expect(isDuplicateUpdate(seen, "abc")).toBe(false);
    recordUpdate(seen, "abc");
    expect(isDuplicateUpdate(seen, "abc")).toBe(true);
  });
});
