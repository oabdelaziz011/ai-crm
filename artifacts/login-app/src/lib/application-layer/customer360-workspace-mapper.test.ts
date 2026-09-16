import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapCustomer360AggregateToWorkspace } from "./customer360-workspace-mapper.ts";
import type { Customer360AggregateDto } from "@workspace/application-layer";

function baseAggregate(avatarUrl: string | null): Customer360AggregateDto {
  return {
    identity: {
      customerId: "cust_1",
      tenantId: "co_1",
      displayName: "Omar Abdelaziz",
    },
    profile: {
      email: "omar@example.com",
      phone: "+201000000001",
      company: null,
      birthday: null,
      avatarColor: "#123456",
      avatarUrl,
      healthScore: 80,
      customerSince: "2024-01-01T00:00:00.000Z",
      notes: null,
    },
    contacts: [],
    addresses: [],
    tags: [],
    customFields: [],
    lead: null,
    summary: {
      isVip: false,
      outstandingBalanceCents: 0,
      currentStatus: "Active",
      currentPaymentStatus: "Paid",
      assignedResource: null,
      priority: "normal",
      totalVisits: 0,
      totalRevenueCents: 0,
      lifetimeValueCents: 0,
      lastVisit: null,
    },
    timeline: { total: 0, recent: [] },
    activities: { total: 0, channels: [], recent: [] },
    notes: [],
    files: [],
    tasks: [],
    bookings: { total: 0, upcoming: 0, items: [] },
    invoices: { total: 0, outstandingCents: 0, items: [] },
    payments: { total: 0, totalCents: 0, items: [] },
    aiContext: {
      healthScore: 80,
      riskLevel: "low",
      insights: [],
    },
    workspace: {
      templateKey: "clinic",
      generatedAt: "2026-09-01T00:00:00.000Z",
      correlationId: "corr-1",
    },
    role: {
      role: "manager",
      visibleSections: [],
    },
    warnings: [],
    telemetry: {
      durationMs: 1,
      repositoryCalls: 1,
      cacheHits: 0,
      failures: 0,
    },
  };
}

describe("mapCustomer360AggregateToWorkspace avatar mapping", () => {
  it("maps customers.avatar_url → profile.avatarUrl → summary.photoUrl", () => {
    const url =
      "https://proj.supabase.co/storage/v1/object/public/customer-avatars/co_1/customers/cust_1/avatar-1.jpg";
    const workspace = mapCustomer360AggregateToWorkspace(baseAggregate(url));
    assert.equal(workspace.summary.photoUrl, url);
  });

  it("keeps photoUrl null when customer has no avatar", () => {
    const workspace = mapCustomer360AggregateToWorkspace(baseAggregate(null));
    assert.equal(workspace.summary.photoUrl, null);
  });
});
