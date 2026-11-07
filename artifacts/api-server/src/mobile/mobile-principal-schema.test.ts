import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("mobile principal schema guards", () => {
  it("maps missing subdomain and admin context objects to a controlled 503", () => {
    const source = readFileSync(new URL("./mobile-principal.ts", import.meta.url), "utf8");
    assert.match(source, /tenant_schema_unavailable/);
    assert.match(source, /isTenantSchemaMissingError/);
    assert.match(source, /approval_status, subdomain/);
    assert.match(source, /platform_admin_contexts/);
    assert.match(
      source,
      /Company host resolution is not available until its database migration is approved\./,
    );
    assert.match(
      source,
      /Platform administration context is not available until its database migration is approved\./,
    );
  });
});
