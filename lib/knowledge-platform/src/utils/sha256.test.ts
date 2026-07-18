import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { sha256Hex } from "./sha256.js";

describe("sha256Hex", () => {
  it("matches node crypto sha256 for utf8 strings", () => {
    const samples = ["", "hello", "Knowledge Foundation PDF ingestion", "مرحبا"];
    for (const sample of samples) {
      const expected = createHash("sha256").update(sample, "utf8").digest("hex");
      assert.equal(sha256Hex(sample), expected);
    }
  });
});
