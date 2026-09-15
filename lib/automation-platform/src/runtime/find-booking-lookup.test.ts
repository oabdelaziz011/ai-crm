import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { variableBinding } from "../field-binding/normalize.js";
import { resolveFindBookingLookup } from "./find-booking-lookup.js";
import type { ExecutionContext } from "../engine/execution-context.js";

function context(input: {
  channel?: ExecutionContext["session"]["channel"];
  externalUserId?: string;
  customerId?: string | null;
  variables?: Record<string, unknown>;
}): ExecutionContext {
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1" } as ExecutionContext["flow"],
    run: { id: "run-1", metadata: {} } as ExecutionContext["run"],
    session: {
      id: "session-1",
      channel: input.channel ?? "instagram",
      external_user_id: input.externalUserId ?? "17841400000000000",
      customer_id: input.customerId ?? null,
    } as ExecutionContext["session"],
    variables: input.variables ?? {},
    customer: { id: input.customerId ?? null },
    currentNode: { id: "find", type: "action", config: {} } as ExecutionContext["currentNode"],
    nodes: [],
    edges: [],
  };
}

describe("resolveFindBookingLookup", () => {
  it("does not use Instagram IGSID as a phone", () => {
    const ctx = context({ channel: "instagram", externalUserId: "17841405788211234" });
    const resolved = resolveFindBookingLookup(
      ctx,
      { lookupBy: "phone", value: variableBinding("{{whatsapp_sender_phone}}") },
      { ...ctx.variables, customer: { id: null } },
    );
    assert.equal(resolved.lookupValue, "");
  });

  it("falls back to WhatsApp sender digits when the template variable is empty", () => {
    const ctx = context({
      channel: "whatsapp",
      externalUserId: "201012345678",
    });
    const resolved = resolveFindBookingLookup(
      ctx,
      { lookupBy: "phone", value: variableBinding("{{whatsapp_sender_phone}}") },
      {},
    );
    assert.equal(resolved.lookupBy, "phone");
    assert.equal(resolved.lookupValue, "201012345678");
  });

  it("falls back to customer.id for Instagram after a linked booking", () => {
    const ctx = context({
      channel: "instagram",
      customerId: "cust-1",
      variables: { customer: { id: "cust-1", phone: "+201012345678" } },
    });
    const scope = {
      customer: { id: "cust-1", phone: "+201012345678" },
    };
    const resolved = resolveFindBookingLookup(
      ctx,
      { lookupBy: "phone", value: variableBinding("{{whatsapp_sender_phone}}") },
      scope,
    );
    assert.equal(resolved.lookupBy, "phone");
    assert.equal(resolved.lookupValue, "+201012345678");
  });

  it("uses customer.id when no phone is available", () => {
    const ctx = context({ channel: "instagram", customerId: "cust-22" });
    const resolved = resolveFindBookingLookup(
      ctx,
      { lookupBy: "phone", value: variableBinding("{{whatsapp_sender_phone}}") },
      { customer: { id: "cust-22" } },
    );
    assert.equal(resolved.lookupBy, "customer_id");
    assert.equal(resolved.lookupValue, "cust-22");
  });

  it("uses the phone collected in the cancel flow", () => {
    const ctx = context({
      channel: "instagram",
      variables: { customer_phone: "01011404109" },
    });
    const resolved = resolveFindBookingLookup(
      ctx,
      { lookupBy: "phone", value: variableBinding("{{customer_phone}}") },
      { customer_phone: "01011404109" },
    );
    assert.equal(resolved.lookupBy, "phone");
    assert.equal(resolved.lookupValue, "01011404109");
  });
});
