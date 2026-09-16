import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertTicketAuditRowInScope,
  buildTicketAuditQueryScope,
  describeTicketActivityEntry,
  extractTicketAuditBeforeAfter,
  isTicketTerminalStatus,
  localizeTicketActivityStatus,
  mapConversationMessageToTicket360Row,
  resolveTicketSystemActorLabel,
  sortTicket360MessagesChronological,
  ticketSlaPresentation,
} from "./ticket360-tab-models.ts";

describe("ticket360 tab models", () => {
  it("scopes audit queries to company + ticket entity id", () => {
    const scope = buildTicketAuditQueryScope("co-a", "ticket-1");
    assert.equal(scope.companyId, "co-a");
    assert.equal(scope.entityId, "ticket-1");
    assert.deepEqual([...scope.entities], ["support_tickets", "support_ticket_comments"]);
    assert.equal(
      assertTicketAuditRowInScope(
        { companyId: "co-a", entityId: "ticket-1", entity: "support_tickets" },
        "co-a",
        "ticket-1",
      ),
      true,
    );
    assert.equal(
      assertTicketAuditRowInScope(
        { companyId: "co-b", entityId: "ticket-1", entity: "support_tickets" },
        "co-a",
        "ticket-1",
      ),
      false,
    );
    assert.equal(
      assertTicketAuditRowInScope(
        { companyId: "co-a", entityId: "ticket-2", entity: "support_tickets" },
        "co-a",
        "ticket-1",
      ),
      false,
    );
  });

  it("maps conversation messages without inventing another conversation id", () => {
    const row = mapConversationMessageToTicket360Row({
      id: "m1",
      conversation_id: "conv-1",
      sequence_number: 2,
      message_type: "incoming",
      content: "hello",
      status: "delivered",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(row.conversationId, "conv-1");
    assert.equal(row.isInternalNote, false);
    const note = mapConversationMessageToTicket360Row({
      id: "m2",
      conversation_id: "conv-1",
      sequence_number: 1,
      message_type: "internal_note",
      content: "private",
      status: "sent",
      created_at: "2026-01-01T00:00:01.000Z",
    });
    assert.equal(note.isInternalNote, true);
    const sorted = sortTicket360MessagesChronological([row, note]);
    assert.deepEqual(
      sorted.map((m) => m.id),
      ["m2", "m1"],
    );
  });

  it("treats resolved/closed SLA due as historical", () => {
    assert.equal(isTicketTerminalStatus("open"), false);
    assert.equal(isTicketTerminalStatus("closed"), true);
    assert.deepEqual(ticketSlaPresentation("open", "2026-01-01T00:00:00.000Z"), {
      showDueAt: true,
      dueIsHistorical: false,
    });
    assert.deepEqual(ticketSlaPresentation("resolved", "2026-01-01T00:00:00.000Z"), {
      showDueAt: true,
      dueIsHistorical: true,
    });
    assert.deepEqual(ticketSlaPresentation("closed", null), {
      showDueAt: false,
      dueIsHistorical: false,
    });
  });

  it("describes operational activity and extracts persisted before/after", () => {
    const t = (key: string, opts?: Record<string, string>) => {
      if (key === "tickets.360.activity.statusChanged" && opts) {
        return `${key}:${opts.from}->${opts.to}`;
      }
      if (key.startsWith("tickets.status.")) {
        return opts?.defaultValue ?? key.slice("tickets.status.".length);
      }
      return key;
    };
    assert.equal(
      describeTicketActivityEntry(
        {
          id: "1",
          action: "UPDATE",
          entity: "support_tickets",
          entityId: "t1",
          userId: "u1",
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: { old: { status: "open" }, new: { status: "closed" } },
        },
        t,
      ),
      "tickets.360.activity.statusChanged:open->closed",
    );
    assert.deepEqual(
      extractTicketAuditBeforeAfter({
        old: { priority: "low" },
        new: { priority: "high" },
      }),
      { before: { priority: "low" }, after: { priority: "high" } },
    );
    assert.equal(resolveTicketSystemActorLabel(null, "النظام"), "النظام");
    assert.equal(resolveTicketSystemActorLabel("u1", "النظام"), null);
  });

  it("localizes Activity status transitions without changing DB codes", () => {
    const arLabels: Record<string, string> = {
      "tickets.status.open": "مفتوحة",
      "tickets.status.in_progress": "قيد المعالجة",
      "tickets.status.waiting_customer": "بانتظار العميل",
      "tickets.status.resolved": "تم الحل",
      "tickets.status.closed": "مغلقة",
    };
    const enLabels: Record<string, string> = {
      "tickets.status.open": "Open",
      "tickets.status.in_progress": "In Progress",
      "tickets.status.waiting_customer": "Waiting for Customer",
      "tickets.status.resolved": "Resolved",
      "tickets.status.closed": "Closed",
    };
    const tAr = (key: string, opts?: Record<string, string>) => {
      if (opts && key === "tickets.360.activity.statusChanged") {
        return `الحالة ${opts.from} → ${opts.to}`;
      }
      return arLabels[key] ?? opts?.defaultValue ?? key;
    };
    const tEn = (key: string, opts?: Record<string, string>) => {
      if (opts && key === "tickets.360.activity.statusChanged") {
        return `Status ${opts.from} → ${opts.to}`;
      }
      return enLabels[key] ?? opts?.defaultValue ?? key;
    };

    assert.equal(localizeTicketActivityStatus("open", tAr), "مفتوحة");
    assert.equal(localizeTicketActivityStatus("in_progress", tAr), "قيد المعالجة");
    assert.equal(localizeTicketActivityStatus("waiting_customer", tEn), "Waiting for Customer");
    assert.equal(localizeTicketActivityStatus("weird_new_status", tEn), "weird_new_status");

    assert.equal(
      describeTicketActivityEntry(
        {
          id: "1",
          action: "UPDATE",
          entity: "support_tickets",
          entityId: "t1",
          userId: "u1",
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: { old: { status: "open" }, new: { status: "in_progress" } },
        },
        tAr,
      ),
      "الحالة مفتوحة → قيد المعالجة",
    );
    assert.equal(
      describeTicketActivityEntry(
        {
          id: "2",
          action: "UPDATE",
          entity: "support_tickets",
          entityId: "t1",
          userId: "u1",
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: { old: { status: "waiting_customer" }, new: { status: "resolved" } },
        },
        tEn,
      ),
      "Status Waiting for Customer → Resolved",
    );
    assert.equal(
      describeTicketActivityEntry(
        {
          id: "3",
          action: "UPDATE",
          entity: "support_tickets",
          entityId: "t1",
          userId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          metadata: { old: { status: "open" }, new: { status: "legacy_unknown" } },
        },
        tEn,
      ),
      "Status Open → legacy_unknown",
    );
  });
});
