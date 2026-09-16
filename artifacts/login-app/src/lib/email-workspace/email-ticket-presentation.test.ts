import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  localizeEmailTicketPriority,
  localizeEmailTicketStatus,
} from "./email-ticket-presentation.ts";

const AR: Record<string, string> = {
  "tickets.status.open": "مفتوحة",
  "tickets.status.in_progress": "قيد المعالجة",
  "tickets.status.waiting_customer": "بانتظار العميل",
  "tickets.status.resolved": "تم الحل",
  "tickets.status.closed": "مغلقة",
  "tickets.priority.low": "منخفضة",
  "tickets.priority.normal": "عادية",
  "tickets.priority.high": "عالية",
  "tickets.priority.urgent": "عاجلة",
};

const EN: Record<string, string> = {
  "tickets.status.open": "Open",
  "tickets.status.in_progress": "In Progress",
  "tickets.status.waiting_customer": "Waiting for Customer",
  "tickets.status.resolved": "Resolved",
  "tickets.status.closed": "Closed",
  "tickets.priority.low": "Low",
  "tickets.priority.normal": "Normal",
  "tickets.priority.high": "High",
  "tickets.priority.urgent": "Urgent",
};

function t(table: Record<string, string>) {
  return (key: string) => table[key] ?? key;
}

describe("email ticket presentation", () => {
  it("localizes Email ticket statuses via tickets.status.* (Arabic)", () => {
    assert.equal(localizeEmailTicketStatus("in_progress", t(AR)), "قيد المعالجة");
    assert.equal(localizeEmailTicketStatus("open", t(AR)), "مفتوحة");
    assert.equal(localizeEmailTicketStatus("waiting_customer", t(AR)), "بانتظار العميل");
    assert.equal(localizeEmailTicketStatus("resolved", t(AR)), "تم الحل");
    assert.equal(localizeEmailTicketStatus("closed", t(AR)), "مغلقة");
  });

  it("localizes Email ticket priority via tickets.priority.*", () => {
    assert.equal(localizeEmailTicketPriority("normal", t(AR)), "عادية");
    assert.equal(localizeEmailTicketPriority("normal", t(EN)), "Normal");
    assert.equal(localizeEmailTicketPriority("urgent", t(AR)), "عاجلة");
  });

  it("falls back to the raw code for unknown values", () => {
    assert.equal(localizeEmailTicketStatus("weird_new_status", t(EN)), "weird_new_status");
    assert.equal(localizeEmailTicketPriority("custom", t(EN)), "custom");
  });
});
