import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTicketQueryCache } from "../cache/in-memory-ticket-query-cache.js";
import { TicketQueryService } from "../services/ticket-query-service.js";
import type { TicketRepository } from "../repositories/ticket-repository-port.js";
import type { TicketCommentRepository } from "../repositories/ticket-repository-port.js";

describe("TicketQueryService cache", () => {
  it("caches metrics reads", async () => {
    let calls = 0;
    const tickets: Pick<TicketRepository, "fetchMetrics"> = {
      async fetchMetrics() {
        calls += 1;
        return {
          totalTickets: 3,
          openTickets: 3,
          closedToday: 1,
          unassignedTickets: 0,
          highUrgentTickets: 0,
          slaCompliancePercent: 100,
          averageResponseMinutes: 5,
          averageResolutionMinutes: 10,
          slaBreaches: 0,
          slaBreachesOpen: 0,
          slaBreachesClosed: 0,
          slaAtRiskOpen: 0,
          ticketsByPriority: { normal: 3 },
          ticketsByStatus: { open: 3 },
          ticketsByAgent: [],
        };
      },
    };

    const comments = {} as TicketCommentRepository;
    const cache = new InMemoryTicketQueryCache();
    const service = new TicketQueryService({ tickets: tickets as TicketRepository, comments, cache });
    const ctx = {
      userId: "user-1",
      companyId: "co-1",
      isSuperAdmin: false,
      hasPermission: () => true,
    };

    await service.fetchMetrics(ctx, { companyId: "co-1", todayStartIso: "2026-08-02T00:00:00.000Z" });
    await service.fetchMetrics(ctx, { companyId: "co-1", todayStartIso: "2026-08-02T00:00:00.000Z" });

    assert.equal(calls, 1);
  });

  it("invalidateCompany clears metrics so the next read is fresh", async () => {
    let calls = 0;
    const tickets: Pick<TicketRepository, "fetchMetrics"> = {
      async fetchMetrics() {
        calls += 1;
        return {
          totalTickets: calls,
          openTickets: calls,
          closedToday: 0,
          unassignedTickets: 0,
          highUrgentTickets: 0,
          slaCompliancePercent: 100,
          averageResponseMinutes: 0,
          averageResolutionMinutes: 0,
          slaBreaches: 0,
          slaBreachesOpen: 0,
          slaBreachesClosed: 0,
          slaAtRiskOpen: 0,
          ticketsByPriority: {},
          ticketsByStatus: { open: calls },
          ticketsByAgent: [],
        };
      },
    };

    const comments = {} as TicketCommentRepository;
    const cache = new InMemoryTicketQueryCache();
    const service = new TicketQueryService({ tickets: tickets as TicketRepository, comments, cache });
    const ctx = {
      userId: "user-1",
      companyId: "co-1",
      isSuperAdmin: false,
      hasPermission: () => true,
    };

    await service.fetchMetrics(ctx, { companyId: "co-1", todayStartIso: "2026-08-02T00:00:00.000Z" });
    await cache.invalidateCompany("co-1");
    const next = await service.fetchMetrics(ctx, {
      companyId: "co-1",
      todayStartIso: "2026-08-02T00:00:00.000Z",
    });

    assert.equal(calls, 2);
    assert.equal(next.openTickets, 2);
  });
});
