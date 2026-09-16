import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("AI email routing independence (Phase 3 regression)", () => {
  it("28-29. AI routing adapter disables human Assignment Governance", () => {
    const src = readFileSync(
      join(here, "../../../artifacts/api-server/src/platform/email-routing-ticket-adapter.ts"),
      "utf8",
    );
    assert.match(src, /assignmentGovernance:\s*false/);
    assert.match(src, /assignConversationEmployee/);
    // Direct conversation write for AI employee targets — not ConversationService governance.
    assert.match(src, /assigned_user_id:\s*scopedAssignee/);
  });
});
