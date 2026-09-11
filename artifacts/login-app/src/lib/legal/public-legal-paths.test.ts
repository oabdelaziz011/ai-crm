import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPublicLegalPath,
  PUBLIC_LEGAL_PATHS,
} from "./public-legal-paths.ts";

describe("public legal paths", () => {
  it("includes Meta-required public URLs", () => {
    assert.deepEqual([...PUBLIC_LEGAL_PATHS], [
      "/privacy-policy",
      "/data-deletion",
      "/terms",
    ]);
  });

  it("treats legal routes as public without an authenticated user", () => {
    for (const path of PUBLIC_LEGAL_PATHS) {
      assert.equal(isPublicLegalPath(path), true);
    }
    assert.equal(isPublicLegalPath("/privacy-policy/"), true);
    assert.equal(isPublicLegalPath("/privacy-policy?ref=meta"), true);
  });

  it("does not treat private app routes as legal pages", () => {
    assert.equal(isPublicLegalPath("/login"), false);
    assert.equal(isPublicLegalPath("/dashboard"), false);
    assert.equal(isPublicLegalPath("/dashboard/settings"), false);
  });
});
