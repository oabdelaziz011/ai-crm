import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTicketToolPromptHint,
  resolveTicketToolKeysForEmployee,
  TICKET_CAPABILITY_TAG,
} from "./ticket-tool-scope.js";

describe("ticket-tool-scope", () => {
  it("keeps explicitly assigned ticket tools even without capability tag", () => {
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

  it("buildTicketToolPromptHint is null when no ticket tools", () => {
    assert.equal(buildTicketToolPromptHint([]), null);
  });

  it("buildTicketToolPromptHint requires ticket number before search_ticket", () => {
    const hint = buildTicketToolPromptHint(["create_ticket", "assign_ticket", "search_ticket"]);
    assert.match(hint!, /search_ticket/);
    assert.match(hint!, /FIRST ask for their ticket number/);
    assert.match(hint!, /Never say you cannot search/);
    assert.match(hint!, /NEVER tell the customer the ticket subject/);
    assert.match(hint!, /assign_ticket/);
  });
});
