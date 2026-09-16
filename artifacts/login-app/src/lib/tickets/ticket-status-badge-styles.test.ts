import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ticketStatusBadgeClassName } from "./ticket-status-badge-styles.ts";

describe("ticket status badge colors", () => {
  it("styles in_progress with amber/orange classes only", () => {
    const cls = ticketStatusBadgeClassName("in_progress");
    assert.ok(cls);
    assert.match(cls, /amber/);
    assert.equal(ticketStatusBadgeClassName("open"), undefined);
    assert.equal(ticketStatusBadgeClassName("waiting_customer"), undefined);
    assert.equal(ticketStatusBadgeClassName("resolved"), undefined);
    assert.equal(ticketStatusBadgeClassName("closed"), undefined);
  });
});
