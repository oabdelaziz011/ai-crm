import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveEmailThreadLifecycle,
  readEmailRoutingMeta,
} from "./email-thread-lifecycle.ts";

describe("email thread lifecycle presentation", () => {
  it("omits events that are not present", () => {
    const events = deriveEmailThreadLifecycle({
      hasIncoming: false,
      hasOutgoing: false,
      hasDraft: false,
      routing: readEmailRoutingMeta({}),
    });
    assert.deepEqual(events, []);
  });

  it("shows classification, assignment, reused ticket, and delivery from real facts", () => {
    const routing = readEmailRoutingMeta({
      emailRoutingClassification: { category: "complaint", confidence: 0.92 },
      emailRoutingDecision: { targetId: "emp-1" },
      emailRoutingTicket: { status: "reused", ticketNumber: "TKT-000124" },
    });
    const events = deriveEmailThreadLifecycle({
      hasIncoming: true,
      hasOutgoing: true,
      hasDraft: true,
      assignedUserId: "emp-1",
      latestOutgoingStatus: "delivered",
      routing,
      ticketNumber: "TKT-000124",
    });
    assert.deepEqual(
      events.map((e) => e.id),
      ["received", "classified", "assigned", "ticket", "drafted", "sent", "delivered"],
    );
    assert.equal(events.find((e) => e.id === "ticket")?.detail, "reused:TKT-000124");
  });

  it("does not invent SLA or ticket when none exist", () => {
    const events = deriveEmailThreadLifecycle({
      hasIncoming: true,
      hasOutgoing: false,
      hasDraft: false,
      routing: readEmailRoutingMeta({ subject: "hello" }),
    });
    assert.deepEqual(events.map((e) => e.id), ["received"]);
  });
});
