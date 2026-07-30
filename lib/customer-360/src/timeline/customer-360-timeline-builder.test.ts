import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Customer360TimelineBuilder } from "./customer-360-timeline-builder.js";

describe("Customer360TimelineBuilder", () => {
  it("merges categories into reverse chronological order", () => {
    const builder = new Customer360TimelineBuilder();
    const timeline = builder.build({
      bookings: [
        {
          id: "b1",
          status: "confirmed",
          scheduledAt: "2026-01-02T10:00:00.000Z",
          source: "scheduling",
        },
      ],
      invoices: [
        {
          id: "i1",
          amount: 100,
          currency: "USD",
          status: "issued",
          dueDate: "2026-01-05T10:00:00.000Z",
          category: "unpaid",
        },
      ],
      conversations: [
        {
          id: "c1",
          channelType: "whatsapp",
          status: "active",
          lastMessagePreview: "Hello",
          lastMessageAt: "2026-01-06T10:00:00.000Z",
        },
      ],
    });

    assert.equal(timeline.length, 3);
    assert.equal(timeline[0]?.category, "conversation");
    assert.equal(timeline[1]?.category, "invoice");
    assert.equal(timeline[2]?.category, "booking");
  });
});
