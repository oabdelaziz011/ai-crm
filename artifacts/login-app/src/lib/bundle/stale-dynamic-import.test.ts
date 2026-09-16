import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStaleDynamicImportError } from "./stale-dynamic-import.ts";

describe("stale dynamic import recovery", () => {
  it("detects Chrome/Vite failed lazy-import errors and ignores unrelated exceptions", () => {
    assert.equal(
      isStaleDynamicImportError(
        new TypeError(
          "Failed to fetch dynamically imported module: http://localhost:5173/src/pages/dashboard/home-page.tsx",
        ),
      ),
      true,
    );
    assert.equal(isStaleDynamicImportError(new Error("useAppShell must be used within AppShellProvider")), false);
    assert.equal(isStaleDynamicImportError(null), false);
  });
});
