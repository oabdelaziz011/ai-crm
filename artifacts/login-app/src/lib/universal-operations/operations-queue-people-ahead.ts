import { compareBookingOrder, type OperationsRow } from "@workspace/universal-operations-engine";

/** Raw booking statuses of visitors who have not been checked in yet. */
const AWAITING_ARRIVAL_STATUSES = new Set(["pending", "waiting", "booked", "confirmed"]);

export function isAwaitingArrival(status: unknown): boolean {
  return AWAITING_ARRIVAL_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

/** Calendar day (YYYY-MM-DD) of an instant in the queue timezone. */
export function queueDayKey(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * One waiting line: same company, same service, same calendar day.
 * Room and appointment time are not part of the line.
 */
export function operationsQueueKey(companyId: string, serviceId: string, day: string): string {
  return `${companyId}|${serviceId}|${day}`;
}

/**
 * Sets `values.people_ahead` for visitors still waiting in the same queue.
 * Order is booking number, oldest first. Anyone no longer waiting gets `null`.
 */
export function assignPeopleAhead(
  rows: OperationsRow[],
  queueKeyOf: (row: OperationsRow) => string,
): OperationsRow[] {
  const queues = new Map<string, OperationsRow[]>();
  for (const row of rows) {
    const key = queueKeyOf(row);
    const queue = queues.get(key);
    if (queue) queue.push(row);
    else queues.set(key, [row]);
  }

  const aheadById = new Map<string, number | null>();
  for (const queue of queues.values()) {
    let waiting = 0;
    for (const row of [...queue].sort(compareBookingOrder)) {
      if (isAwaitingArrival(row.values.status)) {
        aheadById.set(row.id, waiting);
        waiting += 1;
      } else {
        aheadById.set(row.id, null);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    values: { ...row.values, people_ahead: aheadById.get(row.id) ?? null },
  }));
}

/**
 * Queue position counts only visitors still waiting in each queue
 * (company + service + day). Order is booking number, oldest first.
 * Checked-in, no-show, cancelled, and finished visitors get `null`.
 */
export function assignQueueNumbers(
  rows: OperationsRow[],
  queueKeyOf: (row: OperationsRow) => string,
): OperationsRow[] {
  const queues = new Map<string, OperationsRow[]>();
  for (const row of rows) {
    const key = queueKeyOf(row);
    const queue = queues.get(key);
    if (queue) queue.push(row);
    else queues.set(key, [row]);
  }

  const numberById = new Map<string, number | null>();
  for (const queue of queues.values()) {
    let next = 1;
    for (const row of [...queue].sort(compareBookingOrder)) {
      if (isAwaitingArrival(row.values.status)) {
        numberById.set(row.id, next);
        next += 1;
      } else {
        numberById.set(row.id, null);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    values: { ...row.values, queue_number: numberById.get(row.id) ?? null },
  }));
}
