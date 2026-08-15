import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketMetricsSnapshot, TicketSummary } from "@workspace/ticket-platform";
import {
  mapTicketInboxKpis,
  resolveTicketSlaState,
} from "./ticket-inbox-metrics.ts";
import {
  buildTicket360OverviewReadModel,
  resolveAssignedUserSearchFilter,
  resolveTicketListOffset,
} from "./ticket-inbox-read-model.ts";

function metrics(partial: Partial<TicketMetricsSnapshot>): TicketMetricsSnapshot {
  return {
    totalTickets: 0,
    openTickets: 0,
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
    ticketsByStatus: {},
    ticketsByAgent: [],
    ...partial,
  };
}

function ticket(partial: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: "t1",
    ticketNumber: "TKT-1",
    subject: "Subject",
    description: "Desc",
    status: "open",
    priority: "normal",
    customerId: "c1",
    conversationId: null,
    assignedUserId: null,
    assignedUserName: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
    closedAt: null,
    slaDueAt: "2026-08-01T18:00:00.000Z",
    firstResponseAt: null,
    resolvedAt: null,
    ...partial,
  };
}

describe("mapTicketInboxKpis", () => {
  it("maps RPC metrics to inbox KPI strip without inventing New status", () => {
    const kpis = mapTicketInboxKpis(
      metrics({
        totalTickets: 40,
        unassignedTickets: 5,
        highUrgentTickets: 7,
        slaAtRiskOpen: 2,
        slaBreachesOpen: 3,
        ticketsByStatus: {
          open: 10,
          in_progress: 8,
          waiting_customer: 6,
          resolved: 9,
          closed: 7,
        },
        ticketsByPriority: { high: 4, urgent: 3 },
      }),
    );

    assert.deepEqual(
      kpis.map((k) => [k.id, k.value]),
      [
        ["all", 40],
        ["open", 10],
        ["in_progress", 8],
        ["pending", 6],
        ["resolved", 9],
        ["closed", 7],
        ["unassigned", 5],
        ["high_urgent", 7],
        ["sla_at_risk", 2],
        ["sla_breached", 3],
      ],
    );
    assert.equal(
      kpis.some((k) => String(k.id).includes("new")),
      false,
    );
  });

  it("falls back high/urgent from priority buckets when dedicated field is zero", () => {
    const kpis = mapTicketInboxKpis(
      metrics({
        highUrgentTickets: 0,
        ticketsByPriority: { high: 2, urgent: 1, normal: 4 },
        ticketsByStatus: { open: 7 },
      }),
    );
    assert.equal(kpis.find((k) => k.id === "high_urgent")?.value, 3);
    assert.equal(kpis.find((k) => k.id === "all")?.value, 7);
  });
});

describe("resolveTicketSlaState", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");

  it("returns none when no sla due", () => {
    assert.equal(resolveTicketSlaState({ slaDueAt: null, status: "open" }, now), "none");
  });

  it("returns breached / at_risk / safe from real timestamps", () => {
    assert.equal(
      resolveTicketSlaState({ slaDueAt: "2026-08-01T11:00:00.000Z", status: "open" }, now),
      "breached",
    );
    assert.equal(
      resolveTicketSlaState({ slaDueAt: "2026-08-01T12:30:00.000Z", status: "open" }, now),
      "at_risk",
    );
    assert.equal(
      resolveTicketSlaState({ slaDueAt: "2026-08-01T18:00:00.000Z", status: "open" }, now),
      "safe",
    );
  });

  it("evaluates terminal tickets against resolved/closed timestamps", () => {
    assert.equal(
      resolveTicketSlaState(
        {
          slaDueAt: "2026-08-01T12:00:00.000Z",
          status: "resolved",
          resolvedAt: "2026-08-01T13:00:00.000Z",
        },
        now,
      ),
      "breached",
    );
    assert.equal(
      resolveTicketSlaState(
        {
          slaDueAt: "2026-08-01T14:00:00.000Z",
          status: "closed",
          closedAt: "2026-08-01T13:00:00.000Z",
        },
        now,
      ),
      "safe",
    );
  });
});

describe("assignedUserId filtering helpers", () => {
  it("maps all / unassigned / user id", () => {
    assert.deepEqual(resolveAssignedUserSearchFilter("all"), {});
    assert.deepEqual(resolveAssignedUserSearchFilter(undefined), {});
    assert.deepEqual(resolveAssignedUserSearchFilter("unassigned"), { unassignedOnly: true });
    assert.deepEqual(resolveAssignedUserSearchFilter("user-1"), { assignedUserId: "user-1" });
  });
});

describe("pagination helpers", () => {
  it("computes offsets for pages", () => {
    assert.equal(resolveTicketListOffset(1, 25), 0);
    assert.equal(resolveTicketListOffset(2, 25), 25);
    assert.equal(resolveTicketListOffset(0, 25), 0);
    assert.equal(resolveTicketListOffset(3, 1000), 200);
  });
});

describe("Ticket 360 read model", () => {
  it("builds display-only overview fields from ticket summary", () => {
    const model = buildTicket360OverviewReadModel(
      ticket({
        ticketNumber: "TKT-99",
        subject: "Billing issue",
        description: "Invoice mismatch",
        status: "in_progress",
        priority: "high",
        assignedUserId: "u1",
        assignedUserName: "Alex",
        customerId: "c9",
        conversationId: "conv-1",
        slaDueAt: "2099-08-01T18:00:00.000Z",
      }),
    );

    assert.equal(model.ticketNumber, "TKT-99");
    assert.equal(model.subject, "Billing issue");
    assert.equal(model.description, "Invoice mismatch");
    assert.equal(model.status, "in_progress");
    assert.equal(model.priority, "high");
    assert.equal(model.assigneeName, "Alex");
    assert.equal(model.conversationId, "conv-1");
    assert.equal(model.slaState, "safe");
  });
});
