import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTicketAuditPresentationModel,
  describeTicketAuditActionTitle,
  extractTicketAuditCreateSnapshot,
  formatTicketAuditTimelineDate,
  listTicketAuditChangedFields,
  localizeTicketAuditFieldLabel,
  localizeTicketAuditFieldValue,
  resolveTicketAuditActionKind,
  valuesAreEqualForAudit,
} from "./ticket360-audit-presentation.ts";

const en: Record<string, string> = {
  "tickets.360.audit.action.create": "Ticket Created",
  "tickets.360.audit.action.update": "Ticket Updated",
  "tickets.360.audit.action.delete": "Ticket Deleted",
  "tickets.360.audit.action.comment": "Comment Added",
  "tickets.360.audit.action.unknown": "Audit event: {{action}}",
  "tickets.360.audit.entity.ticket": "Ticket",
  "tickets.360.audit.fields.status": "Status",
  "tickets.360.audit.fields.priority": "Priority",
  "tickets.360.audit.fields.assignedUserId": "Assignee",
  "tickets.360.audit.fields.subject": "Subject",
  "tickets.360.audit.fields.ticketNumber": "Ticket Number",
  "tickets.status.open": "Open",
  "tickets.status.in_progress": "In Progress",
  "tickets.status.waiting_customer": "Waiting for Customer",
  "tickets.status.resolved": "Resolved",
  "tickets.status.closed": "Closed",
  "tickets.priority.urgent": "Urgent",
  "tickets.priority.high": "High",
  "tickets.priority.normal": "Normal",
  "tickets.priority.low": "Low",
  "tickets.filter.unassigned": "Unassigned",
};

const ar: Record<string, string> = {
  "tickets.360.audit.action.create": "إنشاء التذكرة",
  "tickets.360.audit.action.update": "تعديل التذكرة",
  "tickets.360.audit.action.delete": "حذف التذكرة",
  "tickets.360.audit.action.comment": "إضافة تعليق",
  "tickets.360.audit.action.unknown": "حدث تدقيق: {{action}}",
  "tickets.360.audit.entity.ticket": "التذكرة",
  "tickets.360.audit.fields.status": "الحالة",
  "tickets.360.audit.fields.priority": "الأولوية",
  "tickets.360.audit.fields.assignedUserId": "المسؤول",
  "tickets.360.audit.fields.subject": "الموضوع",
  "tickets.360.audit.fields.ticketNumber": "رقم التذكرة",
  "tickets.status.open": "مفتوحة",
  "tickets.status.in_progress": "قيد المعالجة",
  "tickets.status.waiting_customer": "بانتظار العميل",
  "tickets.status.resolved": "تم الحل",
  "tickets.status.closed": "مغلقة",
  "tickets.priority.urgent": "عاجلة",
  "tickets.priority.high": "عالية",
  "tickets.priority.normal": "عادية",
  "tickets.priority.low": "منخفضة",
  "tickets.filter.unassigned": "غير معيّنة",
};

function tFactory(dict: Record<string, string>) {
  return (key: string, opts?: Record<string, string>) => {
    let value = dict[key] ?? opts?.defaultValue ?? key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        if (k === "defaultValue") continue;
        value = value.replace(`{{${k}}}`, v);
      }
    }
    return value;
  };
}

describe("ticket360 audit presentation", () => {
  it("maps CREATE / UPDATE / COMMENT / unknown actions", () => {
    const t = tFactory(en);
    assert.equal(
      describeTicketAuditActionTitle(
        {
          id: "1",
          action: "CREATE",
          entity: "support_tickets",
          entityId: "t1",
          userId: null,
          createdAt: "2026-08-20T10:48:00.000Z",
          metadata: null,
        },
        t,
      ),
      "Ticket Created",
    );
    assert.equal(
      describeTicketAuditActionTitle(
        {
          id: "2",
          action: "UPDATE",
          entity: "support_tickets",
          entityId: "t1",
          userId: "u1",
          createdAt: "2026-09-07T11:48:00.000Z",
          metadata: null,
        },
        t,
      ),
      "Ticket Updated",
    );
    assert.equal(
      describeTicketAuditActionTitle(
        {
          id: "3",
          action: "CREATE",
          entity: "support_ticket_comments",
          entityId: "t1",
          userId: "u1",
          createdAt: "2026-09-07T11:48:00.000Z",
          metadata: null,
        },
        t,
      ),
      "Comment Added",
    );
    assert.equal(
      describeTicketAuditActionTitle(
        {
          id: "4",
          action: "ARCHIVE",
          entity: "support_tickets",
          entityId: "t1",
          userId: null,
          createdAt: "2026-09-07T11:48:00.000Z",
          metadata: null,
        },
        t,
      ),
      "Audit event: ARCHIVE",
    );
    assert.equal(resolveTicketAuditActionKind({
      id: "x",
      action: "DELETE",
      entity: "support_tickets",
      entityId: "t1",
      userId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: null,
    }), "delete");
  });

  it("localizes status, priority, and assignee empty values", () => {
    const tAr = tFactory(ar);
    const tEn = tFactory(en);
    assert.equal(localizeTicketAuditFieldValue("status", "open", tAr), "مفتوحة");
    assert.equal(localizeTicketAuditFieldValue("status", "in_progress", tAr), "قيد المعالجة");
    assert.equal(localizeTicketAuditFieldValue("status", "weird", tEn), "weird");
    assert.equal(localizeTicketAuditFieldValue("priority", "urgent", tAr), "عاجلة");
    assert.equal(localizeTicketAuditFieldValue("priority", "low", tEn), "Low");
    assert.equal(localizeTicketAuditFieldValue("assignedUserId", null, tAr), "غير معيّنة");
    assert.equal(localizeTicketAuditFieldLabel("status", tAr), "الحالة");
    assert.equal(localizeTicketAuditFieldLabel("assignedUserId", tEn), "Assignee");
    assert.equal(localizeTicketAuditFieldLabel("totally_unknown_field", tEn), "totally_unknown_field");
  });

  it("renders CREATE snapshot fields without a before section", () => {
    const t = tFactory(en);
    const snapshot = extractTicketAuditCreateSnapshot({
      status: "open",
      subject: "Payment issue",
      priority: "urgent",
      ticketNumber: "TKT-000008",
    });
    assert.deepEqual(snapshot, {
      ticketNumber: "TKT-000008",
      subject: "Payment issue",
      status: "open",
      priority: "urgent",
    });
    const model = buildTicketAuditPresentationModel(
      {
        id: "1",
        action: "CREATE",
        entity: "support_tickets",
        entityId: "t1",
        userId: null,
        createdAt: "2026-08-20T10:48:00.000Z",
        metadata: {
          status: "open",
          subject: "Payment issue",
          priority: "urgent",
          ticketNumber: "TKT-000008",
        },
      },
      t,
    );
    assert.equal(model.kind, "create");
    assert.equal(model.title, "Ticket Created");
    assert.equal(model.entityLabel, "Ticket");
    assert.ok(model.createSnapshot);
    assert.equal(model.changedFields.length, 0);
  });

  it("renders UPDATE diffs only for changed fields", () => {
    const t = tFactory(ar);
    const changes = listTicketAuditChangedFields(
      { status: "open", priority: "urgent", assignedUserId: null },
      { status: "closed", priority: "urgent", assignedUserId: null },
    );
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], {
      field: "status",
      before: "open",
      after: "closed",
    });
    assert.equal(valuesAreEqualForAudit(null, null), true);
    assert.equal(valuesAreEqualForAudit("a", "b"), false);

    const model = buildTicketAuditPresentationModel(
      {
        id: "2",
        action: "UPDATE",
        entity: "support_tickets",
        entityId: "t1",
        userId: "u1",
        createdAt: "2026-09-07T11:48:00.000Z",
        metadata: {
          old: { status: "open", priority: "urgent", assignedUserId: null },
          new: { status: "closed", priority: "urgent", assignedUserId: "u1" },
        },
      },
      t,
    );
    assert.equal(model.kind, "update");
    assert.equal(model.title, "تعديل التذكرة");
    assert.deepEqual(
      model.changedFields.map((c) => c.field),
      ["status", "assignedUserId"],
    );
    assert.equal(localizeTicketAuditFieldValue("status", model.changedFields[0].before, t), "مفتوحة");
    assert.equal(localizeTicketAuditFieldValue("status", model.changedFields[0].after, t), "مغلقة");
  });

  it("formats timeline dates and keeps unknown values safe", () => {
    const formattedEn = formatTicketAuditTimelineDate("2026-09-07T08:48:00.000Z", "en");
    assert.match(formattedEn, /2026/);
    assert.match(formattedEn, /Sep|September/i);
    const formattedAr = formatTicketAuditTimelineDate("2026-09-07T08:48:00.000Z", "ar");
    assert.match(formattedAr, /2026/);
    assert.equal(formatTicketAuditTimelineDate(null, "en"), "—");
  });

  it("treats null userId as system actor (label resolved in UI)", () => {
    const model = buildTicketAuditPresentationModel(
      {
        id: "sys",
        action: "CREATE",
        entity: "support_tickets",
        entityId: "t1",
        userId: null,
        createdAt: "2026-08-20T10:48:00.000Z",
        metadata: { ticketNumber: "TKT-1", status: "open" },
      },
      tFactory(ar),
    );
    assert.equal(model.title, "إنشاء التذكرة");
    assert.equal(model.kind, "create");
  });

  it("keeps human actor userId intact for enrichment (no ID as title)", () => {
    const entry = {
      id: "hum",
      action: "UPDATE",
      entity: "support_tickets",
      entityId: "t1",
      userId: "user-abc-123",
      createdAt: "2026-09-07T11:48:00.000Z",
      metadata: {
        old: { status: "open" },
        new: { status: "closed" },
      },
    };
    const model = buildTicketAuditPresentationModel(entry, tFactory(en));
    assert.equal(model.title, "Ticket Updated");
    assert.equal(entry.userId, "user-abc-123");
    assert.ok(!model.title.includes("user-abc"));
  });

  it("empty audit list is a UI concern; presentation still handles empty metadata", () => {
    const model = buildTicketAuditPresentationModel(
      {
        id: "empty-meta",
        action: "UPDATE",
        entity: "support_tickets",
        entityId: "t1",
        userId: null,
        createdAt: "2026-09-07T11:48:00.000Z",
        metadata: null,
      },
      tFactory(en),
    );
    assert.equal(model.changedFields.length, 0);
    assert.equal(model.hasRawMetadata, false);
    assert.equal(model.createSnapshot, null);
  });
});
