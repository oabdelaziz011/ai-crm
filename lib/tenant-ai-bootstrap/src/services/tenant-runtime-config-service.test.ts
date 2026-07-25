import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDefaultConnection } from "../resolve-tenant-runtime-config.js";

describe("pickDefaultConnection", () => {
  it("prefers default enabled connection", () => {
    const selected = pickDefaultConnection([
      { id: "a", is_default: false, is_enabled: true },
      { id: "b", is_default: true, is_enabled: true },
      { id: "c", is_default: true, is_enabled: false },
    ] as Array<{ id: string; is_default?: boolean; is_enabled?: boolean }>);

    assert.equal(selected?.id, "b");
  });

  it("falls back to first enabled connection", () => {
    const selected = pickDefaultConnection([
      { id: "a", is_default: false, is_enabled: false },
      { id: "b", is_default: false, is_enabled: true },
    ] as Array<{ id: string; is_default?: boolean; is_enabled?: boolean }>);

    assert.equal(selected?.id, "b");
  });
});
