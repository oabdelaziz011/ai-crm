import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Customer360ContextProvider } from "./customer-360-context-provider.js";
import type { Customer360Dto } from "../dto/customer-360-dto.js";

describe("Customer360ContextProvider", () => {
  it("maps customer360 dto into runtime context", () => {
    const provider = new Customer360ContextProvider();
    const dto: Customer360Dto = {
      version: "1",
      customerId: "cust-1",
      companyId: "co-1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      customer: {
        id: "cust-1",
        name: "Alex",
        emails: ["alex@example.com"],
        phones: ["+100000000"],
        tags: [],
      },
      conversation: { previous: [] },
      sales: { opportunities: [] },
      bookings: { upcoming: [], completed: [], cancelled: [] },
      invoices: { unpaid: [], overdue: [], paid: [] },
      support: {
        openTickets: [],
        closedTickets: [],
        lastTicket: null,
        ticketCount: 0,
      },
      leadOrigin: null,
      appointments: { upcoming: [] },
      timeline: [],
    };

    const resolved = provider.resolve({ customer360: dto });
    assert.deepEqual(resolved.customer, {
      id: "cust-1",
      name: "Alex",
      phone: "+100000000",
      email: "alex@example.com",
    });
    assert.equal((resolved.customer360 as Customer360Dto).customer.name, "Alex");
  });
});
