import { beforeEach, describe, expect, it, vi } from "vitest";

const getState = vi.fn();

vi.mock("@/stores/auth", () => ({
  useAuth: {
    getState
  }
}));

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getState.mockReturnValue({ token: "token-123" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => "ok"
      }))
    );
  });

  it("adds the bearer token and calls the api base url", async () => {
    const { apiFetch } = await import("./api.js");

    const result = await apiFetch<{ ok: boolean }>("/health");

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Content-Type": "application/json"
        })
      })
    );
  });
});
