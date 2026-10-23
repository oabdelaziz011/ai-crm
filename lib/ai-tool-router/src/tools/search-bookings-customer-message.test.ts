import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchBookingsCustomerMessage } from "./scheduling-agent-tools.js";

const NOW = new Date("2026-10-15T08:00:00.000Z");

function booking(reference: string, scheduledAt: string, status = "confirmed") {
  return { reference, scheduledAt, status, serviceName: "عيادة", employeeName: "Hassan" };
}

const upcoming = [
  booking("BK-000105", "2026-10-20T08:00:00.000Z"),
  booking("BK-000101", "2026-10-16T08:00:00.000Z"),
  booking("BK-000103", "2026-10-18T08:00:00.000Z"),
  booking("BK-000102", "2026-10-17T08:00:00.000Z"),
  booking("BK-000104", "2026-10-19T08:00:00.000Z"),
];
const past = [
  booking("BK-000090", "2026-10-01T08:00:00.000Z", "completed"),
  booking("BK-000093", "2026-10-14T08:00:00.000Z", "completed"),
  booking("BK-000091", "2026-10-05T08:00:00.000Z", "cancelled"),
  booking("BK-000092", "2026-10-10T08:00:00.000Z", "completed"),
];

describe("buildSearchBookingsCustomerMessage", () => {
  it("lists at most 3 upcoming (soonest first) and only offers the past ones", () => {
    const message = buildSearchBookingsCustomerMessage([...past, ...upcoming], undefined, "list", NOW);
    const refs = message.match(/BK-\d+/g) ?? [];
    assert.deepEqual(refs, ["BK-000101", "BK-000102", "BK-000103"]);
    assert.match(message, /حجوزاتك الجاية:/);
    assert.doesNotMatch(message, /آخر حجوزاتك اللي فاتت:/);
    assert.match(message, /وعندك كمان 2 حجز جاي\./);
    assert.match(message, /قولّي «حجوزاتي اللي فاتت»/);
  });

  it("lists at most 3 past bookings (latest first) when asked for them", () => {
    const message = buildSearchBookingsCustomerMessage([...past, ...upcoming], undefined, "list", NOW, "past");
    const refs = message.match(/BK-\d+/g) ?? [];
    assert.deepEqual(refs, ["BK-000093", "BK-000092", "BK-000091"]);
    assert.match(message, /آخر حجوزاتك اللي فاتت:/);
    assert.doesNotMatch(message, /حجوزاتك الجاية:/);
  });

  it("says there is nothing upcoming instead of falling back to past bookings", () => {
    const message = buildSearchBookingsCustomerMessage(past, undefined, "list", NOW);
    assert.match(message, /مفيش عندك حجوزات جاية\./);
    assert.doesNotMatch(message, /BK-/);
  });

  it("offers only the 3 nearest cancellable bookings and skips checked-in ones", () => {
    const checkedIn = booking("BK-000099", "2026-10-15T10:00:00.000Z", "checked_in");
    const message = buildSearchBookingsCustomerMessage([checkedIn, ...upcoming, ...past], undefined, "cancel", NOW);
    const refs = message.match(/BK-\d+/g) ?? [];
    assert.deepEqual(refs.slice(0, 3), ["BK-000101", "BK-000102", "BK-000103"]);
    assert.doesNotMatch(message, /BK-000099|BK-000104|BK-000105/);
    assert.match(message, /لقيت 5 موعد ممكن إلغاؤه:/);
    assert.match(message, /ومعاهم 2 حجز تاني/);
    assert.match(message, /أنهي موعد تلغي/);
  });
});
