import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTicketToolPromptHint,
  resolveTicketToolKeysForEmployee,
  TICKET_CAPABILITY_TAG,
} from "./ticket-tool-scope.js";

describe("ticket-tool-scope", () => {
  it("strips ticket tools when employee lacks ticket capability", () => {
    const keys = resolveTicketToolKeysForEmployee({
      tags: [],
      allowedToolKeys: ["create_customer", "create_ticket"],
    });
    assert.deepEqual(keys, ["create_customer", "create_ticket"]);
  });

  it("auto-includes ticket tools when capability tag is present", () => {
    const keys = resolveTicketToolKeysForEmployee({
      tags: [TICKET_CAPABILITY_TAG],
      allowedToolKeys: ["create_customer"],
    });
    assert.ok(keys.includes("create_ticket"));
    assert.ok(keys.includes("search_ticket"));
  });

  it("builds prompt hint only when ticket tools enabled", () => {
    assert.equal(buildTicketToolPromptHint([]), null);
    assert.match(buildTicketToolPromptHint(["create_ticket", "assign_ticket"])!, /assign_ticket/);
  });
});
