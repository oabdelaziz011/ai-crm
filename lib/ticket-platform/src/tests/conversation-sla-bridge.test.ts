import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureConversationMetadataSlaDueAt,
  mergeLifecycleSlaDueAt,
  readLifecycleSlaDueAt,
  resolveAuthoritativeConversationSlaDueAt,
  createConversationPrioritySlaHook,
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

describe("conversation SLA bridge (ticket-centric)", () => {
  it("computes dueAt from company SLA settings + priority (same as ticket calculator)", async () => {
    const referenceNow = new Date("2026-09-05T12:00:00.000Z");
    const settings: TicketSlaSettings = {
      companyId: "co-a",
      urgentHours: 2,
      highHours: 4,
      normalHours: 12,
      lowHours: 48,
      warningHours: 1,
    };
    const due = await resolveAuthoritativeConversationSlaDueAt({
      companyId: "co-a",
      priority: "urgent",
      slaSettings: settingsPort(settings),
      referenceNow,
    });
    assert.equal(
      due,
      computeSlaDueAt("urgent", referenceNow, resolveSlaHoursByPriority(settings)),
    );
    assert.equal(due, "2026-09-05T14:00:00.000Z");
  });

  it("falls back to platform default hours when company has no settings row", async () => {
    const referenceNow = new Date("2026-09-05T12:00:00.000Z");
    const due = await resolveAuthoritativeConversationSlaDueAt({
      companyId: "co-missing",
      priority: "normal",
      slaSettings: settingsPort(null),
      referenceNow,
    });
    assert.equal(due, computeSlaDueAt("normal", referenceNow));
    assert.equal(due, "2026-09-06T12:00:00.000Z");
  });

  it("does not invent SLA without ticketSlaDueAt", async () => {
    const { metadata, wrote, slaDueAt } = await ensureConversationMetadataSlaDueAt({
      metadata: {
        lifecycle: { state: "AI_HANDLING", owner: { kind: "ai_employee", id: "e1", label: "Bot" } },
        other: true,
      },
      companyId: "co-a",
      priority: "high",
      slaSettings: settingsPort({
        companyId: "co-a",
        urgentHours: 1,
        highHours: 3,
        normalHours: 6,
        lowHours: 12,
        warningHours: 1,
      }),
      referenceNow: new Date("2026-09-05T10:00:00.000Z"),
    });
    assert.equal(wrote, false);
    assert.equal(slaDueAt, null);
    assert.equal(readLifecycleSlaDueAt(metadata), null);
    const lifecycle = metadata.lifecycle as Record<string, unknown>;
    assert.equal(lifecycle.state, "AI_HANDLING");
    assert.equal(metadata.other, true);
  });

  it("mirrors ticket SLA into lifecycle when ticketSlaDueAt is provided", async () => {
    const ticketDue = "2026-09-05T13:00:00.000Z";
    const { metadata, wrote, slaDueAt } = await ensureConversationMetadataSlaDueAt({
      metadata: {
        lifecycle: { state: "AI_HANDLING" },
        other: true,
      },
      companyId: "co-a",
      ticketSlaDueAt: ticketDue,
      slaSettings: settingsPort(null),
    });
    assert.equal(wrote, true);
    assert.equal(slaDueAt, ticketDue);
    assert.equal(readLifecycleSlaDueAt(metadata), ticketDue);
    assert.equal((metadata.lifecycle as { state: string }).state, "AI_HANDLING");
    assert.equal(metadata.other, true);
  });

  it("onlyIfMissing preserves an existing dueAt when mirroring", async () => {
    const existing = "2026-09-01T00:00:00.000Z";
    const { metadata, wrote, slaDueAt } = await ensureConversationMetadataSlaDueAt({
      metadata: { lifecycle: { slaDueAt: existing, state: "ASSIGNED" } },
      companyId: "co-a",
      ticketSlaDueAt: "2026-09-05T12:00:00.000Z",
      slaSettings: settingsPort(null),
      onlyIfMissing: true,
    });
    assert.equal(wrote, false);
    assert.equal(slaDueAt, existing);
    assert.equal(readLifecycleSlaDueAt(metadata), existing);
  });

  it("does not leak company settings across tenants", async () => {
    const settings: TicketSlaSettings = {
      companyId: "co-a",
      urgentHours: 1,
      highHours: 1,
      normalHours: 1,
      lowHours: 1,
      warningHours: 1,
    };
    const referenceNow = new Date("2026-09-05T12:00:00.000Z");
    const dueOther = await resolveAuthoritativeConversationSlaDueAt({
      companyId: "co-b",
      priority: "urgent",
      slaSettings: settingsPort(settings),
      referenceNow,
    });
    assert.equal(dueOther, "2026-09-05T16:00:00.000Z");
  });

  it("mergeLifecycleSlaDueAt is additive", () => {
    const next = mergeLifecycleSlaDueAt(
      { lifecycle: { state: "NEW", slaDueAt: "old" }, keep: 1 },
      "2026-09-05T15:00:00.000Z",
    );
    assert.equal(readLifecycleSlaDueAt(next), "2026-09-05T15:00:00.000Z");
    assert.equal((next.lifecycle as { state: string }).state, "NEW");
    assert.equal(next.keep, 1);
  });

  it("conversation priority hook does not invent or rewrite SLA", async () => {
    const hook = createConversationPrioritySlaHook({ slaSettings: settingsPort(null) });
    const metadata = { lifecycle: { state: "ASSIGNED", slaDueAt: "2099-01-01T00:00:00.000Z" } };
    const next = await hook.afterPriorityChange({
      companyId: "co-a",
      priority: "urgent",
      metadata,
      referenceNow: new Date("2026-09-05T10:00:00.000Z"),
    });
    assert.equal(readLifecycleSlaDueAt(next), "2099-01-01T00:00:00.000Z");
    assert.equal((next.lifecycle as { state: string }).state, "ASSIGNED");
  });
});
