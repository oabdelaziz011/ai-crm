import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createConversationPrioritySlaHook,
  ensureConversationMetadataSlaDueAt,
  readLifecycleSlaDueAt,
  resolveAuthoritativeConversationSlaDueAt,
} from "../services/conversation-sla-bridge.js";
import { computeSlaDueAt, resolveSlaHoursByPriority } from "../services/ticket-sla-service.js";
import type { TicketSlaSettingsPort } from "../ports/ticket-platform-ports.js";
import type { TicketSlaSettings } from "../services/ticket-sla-service.js";

function settingsPort(settings: TicketSlaSettings | null): TicketSlaSettingsPort {
  return {
    getByCompanyId: async (companyId: string) => {
      if (!settings) return null;
      if (settings.companyId !== companyId) return null;
      return settings;
    },
  };
}

describe("conversation priority → SLA (ticket-centric: no invent)", () => {
  const companySettings: TicketSlaSettings = {
    companyId: "co-a",
    urgentHours: 2,
    highHours: 4,
    normalHours: 12,
    lowHours: 48,
    warningHours: 1,
  };

  it("A. conversation priority change does not rewrite SLA metadata", async () => {
    const hook = createConversationPrioritySlaHook({ slaSettings: settingsPort(companySettings) });
    const next = await hook.afterPriorityChange({
      companyId: "co-a",
      priority: "urgent",
      metadata: { lifecycle: { state: "ASSIGNED", slaDueAt: "2099-01-01T00:00:00.000Z" } },
      referenceNow: new Date("2026-09-05T10:00:00.000Z"),
    });
    assert.equal(readLifecycleSlaDueAt(next), "2099-01-01T00:00:00.000Z");
  });

  it("B. ticket calculator still shortens urgent vs normal (ticket path)", async () => {
    const referenceNow = new Date("2026-09-05T10:00:00.000Z");
    const hours = resolveSlaHoursByPriority(companySettings);
    assert.ok(
      new Date(computeSlaDueAt("urgent", referenceNow, hours)).getTime() <
        new Date(computeSlaDueAt("normal", referenceNow, hours)).getTime(),
    );
  });

  it("C. ensure without ticketSlaDueAt does not invent SLA", async () => {
    const { metadata, wrote } = await ensureConversationMetadataSlaDueAt({
      metadata: {
        lifecycle: {
          state: "ESCALATED",
          owner: { kind: "user", id: "u9", label: "Boss" },
          queueId: "q-99",
        },
        other: 1,
      },
      companyId: "co-a",
      priority: "high",
      slaSettings: settingsPort(companySettings),
      referenceNow: new Date("2026-09-05T10:00:00.000Z"),
    });
    assert.equal(wrote, false);
    assert.equal(readLifecycleSlaDueAt(metadata), null);
    const lifecycle = metadata.lifecycle as Record<string, unknown>;
    assert.equal(lifecycle.state, "ESCALATED");
    assert.equal((lifecycle.owner as { id: string }).id, "u9");
    assert.equal(lifecycle.queueId, "q-99");
    assert.equal(metadata.other, 1);
  });

  it("D. ensure with ticketSlaDueAt mirrors ticket due", async () => {
    const ticketDue = "2026-09-05T14:00:00.000Z";
    const { metadata, wrote } = await ensureConversationMetadataSlaDueAt({
      metadata: { lifecycle: { state: "ASSIGNED" } },
      companyId: "co-a",
      ticketSlaDueAt: ticketDue,
      slaSettings: settingsPort(companySettings),
    });
    assert.equal(wrote, true);
    assert.equal(readLifecycleSlaDueAt(metadata), ticketDue);
  });

  it("E. different company SLA settings are respected (isolation)", async () => {
    const referenceNow = new Date("2026-09-05T10:00:00.000Z");
    const coA = await resolveAuthoritativeConversationSlaDueAt({
      companyId: "co-a",
      priority: "urgent",
      slaSettings: settingsPort(companySettings),
      referenceNow,
    });
    const coB = await resolveAuthoritativeConversationSlaDueAt({
      companyId: "co-b",
      priority: "urgent",
      slaSettings: settingsPort(companySettings),
      referenceNow,
    });
    assert.equal(coA, "2026-09-05T12:00:00.000Z");
    assert.equal(coB, "2026-09-05T14:00:00.000Z");
  });
});
