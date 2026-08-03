import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Customer360Aggregator } from "./customer-360-aggregator.js";
import type { Customer360DataPort } from "../ports/customer-360-data-port.js";

describe("Customer360Aggregator", () => {
  it("builds dto and uses cache on second call", async () => {
    let fetchCount = 0;
    const dataPort: Customer360DataPort = {
      async resolveCustomerId() {
        return "cust-1";
      },
      async fetchBundle() {
        fetchCount += 1;
        return {
          profile: {
            id: "cust-1",
            name: "Alex",
            emails: ["alex@example.com"],
            phones: [],
            tags: [],
          },
          previousConversations: [],
          opportunities: [],
          bookings: { upcoming: [], completed: [], cancelled: [] },
          invoices: { unpaid: [], overdue: [], paid: [] },
          support: {
            openTickets: [],
            closedTickets: [],
            lastTicket: null,
            ticketCount: 0,
          },
        };
      },
    };

    const aggregator = new Customer360Aggregator({ dataPort });
    const access = {
      companyId: "co-1",
      actorUserId: "user-1",
      isSuperAdmin: true,
      hasPermission: () => true,
    };

    const first = await aggregator.build(access, { companyId: "co-1", customerId: "cust-1" });
    const second = await aggregator.build(access, { companyId: "co-1", customerId: "cust-1" });

    assert.equal(first?.customer.name, "Alex");
    assert.equal(second?.customer.name, "Alex");
    assert.equal(fetchCount, 1);
  });
});
