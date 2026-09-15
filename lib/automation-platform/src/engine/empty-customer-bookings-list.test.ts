import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createActionNodeHandler } from "./built-in-nodes.js";
import type { ExecutionContext } from "./execution-context.js";
import { readOutboundQueue } from "../runtime/outbound-queue.js";

describe("empty customer bookings list", () => {
  it("ends the run after the not-found message instead of continuing to cancellation", async () => {
    const handler = createActionNodeHandler({
      lookupOptions: {
        async fetchListOptions() {
          return [];
        },
      },
    });
    const context = {
      company: { id: "company-1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1", channel: "instagram" },
      variables: {
        conversation: { language: "ar" },
        customer_phone: "01000000000",
      },
      customer: { id: null },
      currentNode: {
        id: "bookings-list",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "customer_bookings",
          displayField: "display_label",
          valueField: "id",
          filters: { phone: "{{customer_phone}}" },
          inputKey: "booking",
          outputVariable: "booking",
        },
      },
      nodes: [],
      edges: [],
    } as unknown as ExecutionContext;

    const result = await handler.execute(context);

    assert.equal(result.outcome, "completed");
    assert.equal(result.variables?.__waitingFor, null);
    assert.equal(
      readOutboundQueue(result.variables ?? {}).at(-1)?.text,
      "مش لاقي ميعاد قادم باسم حضرتك.",
    );
  });
});
