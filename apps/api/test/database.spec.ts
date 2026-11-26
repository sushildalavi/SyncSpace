import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createPool } from "../src/db/database.module.js";

describe("database connections", () => {
  it("survive PostgreSQL going away, instead of ending the process", async () => {
    const pool = createPool("postgres://nobody:nothing@127.0.0.1:1/none");
    const lost = new Error("terminating connection due to unexpected postmaster exit");
    // an EventEmitter throws from emit("error") when nobody listens, which is what crashed the API
    expect(() => pool.emit("error", lost, {} as never)).not.toThrow();
    const checkedOut = new EventEmitter();
    pool.emit("connect", checkedOut as never);
    expect(() => checkedOut.emit("error", lost)).not.toThrow();
    await pool.end();
  });
});
