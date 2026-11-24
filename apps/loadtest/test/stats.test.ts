import { describe, expect, it } from "vitest";
import { percentile, summarize } from "../src/stats.js";

describe("stats", () => {
  it("computes nearest-rank percentiles", () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(data, 50)).toBe(50);
    expect(percentile(data, 95)).toBe(95);
    expect(percentile(data, 99)).toBe(99);
  });
  it("summarizes samples", () => {
    expect(summarize([5, 1, 3])).toMatchObject({ count: 3, p50: 3, max: 5 });
    expect(summarize([]).count).toBe(0);
  });
});
