import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertZeroRuntimeHardcodedPatterns } from "./runtime-hardcoded-audit.js";
import { buildEmptyCustomer360Workspace } from "../runtime/empty-customer360-workspace.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");

describe("Runtime hardcoded audit", () => {
  it("reports zero forbidden runtime patterns in scoped packages", () => {
    assert.doesNotThrow(() =>
      assertZeroRuntimeHardcodedPatterns([
        join(repoRoot, "lib/universal-operations-engine/src"),
        join(repoRoot, "lib/universal-workspace-platform/src"),
        join(repoRoot, "artifacts/login-app/src/hooks/universal-operations"),
        join(repoRoot, "artifacts/login-app/src/components/universal-operations"),
        join(repoRoot, "artifacts/login-app/src/context"),
        join(repoRoot, "artifacts/login-app/src/lib/application-layer"),
      ]),
    );
  });

  it("builds empty customer360 workspace without mock entities", () => {
    const empty = buildEmptyCustomer360Workspace();
    assert.equal(empty.isEmpty, true);
    assert.equal(empty.customer.name, "");
    assert.equal(empty.timeline.length, 0);
  });
});
