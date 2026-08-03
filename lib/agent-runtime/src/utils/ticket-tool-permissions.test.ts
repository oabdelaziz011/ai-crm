import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findMissingTicketAlignedPermission,
  getAlignedTicketToolRequirements,
} from "./ticket-tool-permissions.js";

describe("ticket-tool-permissions", () => {
  it("maps create_ticket requirements", () => {
    assert.deepEqual(getAlignedTicketToolRequirements("create_ticket"), ["tools.execute", "tickets.create"]);
  });

  it("accepts tickets.manage alias for create", () => {
    const missing = findMissingTicketAlignedPermission(
      {
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute" || code === "tickets.manage",
      },
      ["tools.execute", "tickets.create"],
    );
    assert.equal(missing, null);
  });

  it("reports missing ticket permission", () => {
    const missing = findMissingTicketAlignedPermission(
      {
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute",
      },
      ["tools.execute", "tickets.assign"],
    );
    assert.equal(missing, "tickets.assign");
  });
});
