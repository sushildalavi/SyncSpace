import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyDocumentUpdate, encodeDocumentState, mergeDocumentUpdates } from "../src/index.js";

describe("collaboration helpers", () => {
  it("merges concurrent updates into one converged state", () => {
    const left = new Y.Doc();
    const right = new Y.Doc();

    left.getText("body").insert(0, "hello");
    right.getText("body").insert(0, "world");

    const merged = mergeDocumentUpdates([encodeDocumentState(left), encodeDocumentState(right)]);
    const replica = new Y.Doc();
    applyDocumentUpdate(replica, merged);

    expect(replica.getText("body").toString()).toContain("hello");
    expect(replica.getText("body").toString()).toContain("world");
  });
});
