import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkedStore } from "./secure-chunk";
import { memoryStore } from "./sign-in";

describe("secure session storage", () => {
  it("round-trips a value larger than one secure-store chunk and removes it", async () => {
    const backend = memoryStore();
    const store = chunkedStore(backend);
    const value = `header.${"a".repeat(4000)}.sig`;
    await store.setItem("session", value);
    assert.equal(await store.getItem("session"), value);
    assert.equal(await backend.getItem("session"), null);
    await store.removeItem("session");
    assert.equal(await store.getItem("session"), null);
  });
});
