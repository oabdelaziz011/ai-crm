import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveManualChunk } from "./manual-chunks.js";

describe("resolveManualChunk", () => {
  it("keeps Radix primitives in the React vendor chunk to avoid circular init", () => {
    assert.equal(
      resolveManualChunk("/repo/node_modules/@radix-ui/react-slot/dist/index.js"),
      "vendor-react",
    );
    assert.equal(
      resolveManualChunk("/repo/node_modules/@radix-ui/react-dialog/dist/index.mjs"),
      "vendor-react",
    );
    assert.equal(resolveManualChunk("/repo/node_modules/react/index.js"), "vendor-react");
    assert.equal(resolveManualChunk("/repo/node_modules/react-dom/index.js"), "vendor-react");
    assert.equal(resolveManualChunk("/repo/node_modules/i18next/index.js"), "vendor-react");
  });

  it("does not emit a separate vendor-radix chunk", () => {
    const ids = [
      "/repo/node_modules/@radix-ui/react-slot/dist/index.js",
      "/repo/node_modules/@radix-ui/react-compose-refs/dist/index.js",
      "/repo/node_modules/react/cjs/react.production.js",
    ];
    for (const id of ids) {
      assert.notEqual(resolveManualChunk(id), "vendor-radix");
    }
  });
});
