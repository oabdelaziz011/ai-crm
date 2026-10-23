import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import {
  assignPeopleAhead,
  assignQueueNumbers,
  operationsQueueKey,
  queueDayKey,
} from "./operations-queue-people-ahead.js";

function row(id: string, reference: string, service: string, status: string): OperationsRow {
  return {
    id,
    companyId: "c1",
    customerId: null,
    leadId: null,
    statusId: "st",
    paymentStatusId: "pay",
    assignedResourceId: null,
    priority: "normal",
    tags: [],
    values: { reference, service, status, scheduled_at: "2026-10-14T08:00:00.000Z" },
    createdAt: "2026-10-14T07:00:00.000Z",
    updatedAt: "2026-10-14T07:00:00.000Z",
  };
}

function aheadOf(rows: OperationsRow[]) {
  const result = assignPeopleAhead(rows, (r) => String(r.values.service));
  return Object.fromEntries(result.map((r) => [r.id, r.values.people_ahead]));
}

describe("assignPeopleAhead", () => {
  it("counts earlier waiting visitors of the same service by booking number", () => {
    const ahead = aheadOf([
      row("d", "BK-000004", "xray", "confirmed"),
      row("a", "BK-000001", "xray", "confirmed"),
      row("c", "BK-000003", "xray", "pending"),
      row("b", "BK-000002", "xray", "confirmed"),
    ]);
    assert.deepEqual(ahead, { a: 0, b: 1, c: 2, d: 3 });
  });

  it("decreases the count once an earlier visitor is checked in", () => {
    const ahead = aheadOf([
      row("a", "BK-000001", "xray", "checked_in"),
      row("b", "BK-000002", "xray", "confirmed"),
      row("c", "BK-000003", "xray", "confirmed"),
      row("d", "BK-000004", "xray", "confirmed"),
    ]);
    assert.deepEqual(ahead, { a: null, b: 0, c: 1, d: 2 });
  });

  it("keeps separate queues per service", () => {
    const ahead = aheadOf([
      row("a", "BK-000001", "xray", "confirmed"),
      row("b", "BK-000002", "lab", "confirmed"),
      row("c", "BK-000003", "xray", "confirmed"),
      row("d", "BK-000004", "lab", "confirmed"),
    ]);
    assert.deepEqual(ahead, { a: 0, b: 0, c: 1, d: 1 });
  });

  it("ignores cancelled, no-show and finished visitors", () => {
    const ahead = aheadOf([
      row("a", "BK-000001", "xray", "cancelled"),
      row("b", "BK-000002", "xray", "no_show"),
      row("c", "BK-000003", "xray", "completed"),
      row("d", "BK-000004", "xray", "in_progress"),
      row("e", "BK-000005", "xray", "confirmed"),
    ]);
    assert.deepEqual(ahead, { a: null, b: null, c: null, d: null, e: 0 });
  });
});

function queueKey(entry: OperationsRow, day = "2026-10-15"): string {
  return operationsQueueKey(entry.companyId, String(entry.values.service), day);
}

function placed(rows: OperationsRow[], dayOf?: (entry: OperationsRow) => string) {
  const keyOf = (entry: OperationsRow) => queueKey(entry, dayOf?.(entry));
  const withAhead = assignPeopleAhead(rows, keyOf);
  const withNumbers = assignQueueNumbers(withAhead, keyOf);
  return Object.fromEntries(
    withNumbers.map((entry) => [
      entry.id,
      { position: entry.values.queue_number, ahead: entry.values.people_ahead },
    ]),
  );
}

describe("assignQueueNumbers", () => {
  it("skips a no-show the same way it skips someone who already checked in", () => {
    const rows = [
      row("a", "BK-000001", "xray", "checked_in"),
      row("b", "BK-000002", "xray", "no_show"),
      row("c", "BK-000003", "xray", "confirmed"),
      row("d", "BK-000004", "xray", "pending"),
    ];
    const numbered = assignQueueNumbers(rows, (entry) => queueKey(entry));
    assert.deepEqual(
      Object.fromEntries(numbered.map((entry) => [entry.id, entry.values.queue_number])),
      { a: null, b: null, c: 1, d: 2 },
    );
  });

  it("keeps the waiting line consecutive after a cancellation, ordered by booking number", () => {
    const waiting = [
      row("a", "BK-000010", "clinic", "confirmed"),
      row("b", "BK-000011", "clinic", "confirmed"),
      row("c", "BK-000012", "clinic", "confirmed"),
    ];
    assert.deepEqual(placed(waiting), {
      a: { position: 1, ahead: 0 },
      b: { position: 2, ahead: 1 },
      c: { position: 3, ahead: 2 },
    });

    const afterCancel = waiting.map((entry) =>
      entry.id === "b" ? { ...entry, values: { ...entry.values, status: "cancelled" } } : entry,
    );
    assert.deepEqual(placed(afterCancel), {
      a: { position: 1, ahead: 0 },
      b: { position: null, ahead: null },
      c: { position: 2, ahead: 1 },
    });

    const rebooked = [
      ...afterCancel,
      {
        ...row("d", "BK-000013", "clinic", "confirmed"),
        values: {
          ...row("d", "BK-000013", "clinic", "confirmed").values,
          scheduled_at: "2026-10-15T06:00:00.000Z",
        },
      },
    ];
    assert.deepEqual(placed(rebooked), {
      a: { position: 1, ahead: 0 },
      b: { position: null, ahead: null },
      c: { position: 2, ahead: 1 },
      d: { position: 3, ahead: 2 },
    });
  });

  it("orders by booking number when appointment times are out of order", () => {
    const earlyNumberLateTime = row("a", "BK-000010", "clinic", "confirmed");
    earlyNumberLateTime.values.scheduled_at = "2026-10-15T15:00:00.000Z";
    const lateNumberEarlyTime = row("b", "BK-000012", "clinic", "confirmed");
    lateNumberEarlyTime.values.scheduled_at = "2026-10-15T07:00:00.000Z";
    assert.deepEqual(placed([lateNumberEarlyTime, earlyNumberLateTime]), {
      a: { position: 1, ahead: 0 },
      b: { position: 2, ahead: 1 },
    });
  });

  it("keeps separate queues per company, service, and day", () => {
    const otherCompany = row("b", "BK-000011", "clinic", "confirmed");
    otherCompany.companyId = "c2";
    const otherService = row("c", "BK-000012", "lab", "confirmed");
    const otherDay = row("d", "BK-000013", "clinic", "confirmed");
    otherDay.values.scheduled_at = "2026-10-16T08:00:00.000Z";
    const result = placed(
      [row("a", "BK-000010", "clinic", "confirmed"), otherCompany, otherService, otherDay],
      (entry) => queueDayKey(String(entry.values.scheduled_at), "UTC"),
    );
    assert.deepEqual(result, {
      a: { position: 1, ahead: 0 },
      b: { position: 1, ahead: 0 },
      c: { position: 1, ahead: 0 },
      d: { position: 1, ahead: 0 },
    });
  });
});

describe("queueDayKey", () => {
  it("uses the queue timezone for the calendar day", () => {
    assert.equal(queueDayKey("2026-10-14T22:30:00.000Z", "Africa/Cairo"), "2026-10-15");
    assert.equal(queueDayKey("2026-10-14T22:30:00.000Z", "UTC"), "2026-10-14");
  });
});
