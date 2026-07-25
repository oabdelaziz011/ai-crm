import assert from "node:assert/strict";
import { AvailabilityPolicy } from "../src/lib/scheduling/availability-engine/availability-policy.ts";
import { AvailabilityResolver } from "../src/lib/scheduling/availability-engine/availability-resolver.ts";
import { TimezoneResolver } from "../src/lib/scheduling/availability-engine/timezone-resolver.ts";
import type { AvailabilityContextSnapshot } from "../src/lib/scheduling/availability-engine/availability-context.ts";
import { DEFAULT_BOOKING_RULES } from "../src/lib/scheduling/types.ts";

function resolve(snapshot: AvailabilityContextSnapshot) {
  return AvailabilityResolver.resolve(snapshot);
}

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const RESOURCE_ID = "00000000-0000-4000-8000-000000000001";
const SERVICE_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_SERVICE_ID = "00000000-0000-4000-8000-000000000003";
const WEEKLY_MONDAY_ID = "00000000-0000-4000-8000-000000000010";

function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: RESOURCE_ID,
    company_id: COMPANY_ID,
    branch_id: null,
    name: "Dr. Smith",
    resource_type: "doctor" as const,
    status: "active" as const,
    timezone: "UTC",
    description: null,
    metadata: {},
    created_at: "",
    updated_at: "",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    ...overrides,
  };
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE_ID,
    company_id: COMPANY_ID,
    name: "Consultation",
    description: null,
    duration_minutes: 30,
    status: "active" as const,
    created_at: "",
    updated_at: "",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    ...overrides,
  };
}

function weeklyMonday(opens = "09:00", closes = "17:00", is_closed = false) {
  return {
    id: WEEKLY_MONDAY_ID,
    company_id: COMPANY_ID,
    resource_id: RESOURCE_ID,
    day_of_week: 1 as const,
    is_closed,
    opens_at: is_closed ? null : opens,
    closes_at: is_closed ? null : closes,
    created_at: "",
    updated_at: "",
  };
}

function breakRow(starts: string, ends: string) {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    company_id: COMPANY_ID,
    weekly_hours_id: WEEKLY_MONDAY_ID,
    resource_id: RESOURCE_ID,
    starts_at: starts,
    ends_at: ends,
    label: "Lunch",
    created_at: "",
    updated_at: "",
  };
}

function buildSnapshot(partial: Partial<AvailabilityContextSnapshot>): AvailabilityContextSnapshot {
  return {
    resourceId: RESOURCE_ID,
    resource: resource(),
    service: service(),
    branch: null,
    weeklyHours: [weeklyMonday()],
    breaks: [breakRow("13:00", "14:00")],
    exceptions: [],
    holidays: [],
    bookingRules: {
      id: "rules",
      company_id: COMPANY_ID,
      ...DEFAULT_BOOKING_RULES,
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
    },
    serviceCapabilityIds: [SERVICE_ID],
    date: "2026-07-20",
    serviceId: SERVICE_ID,
    options: {},
    ...partial,
  };
}

{
  const result = resolve(buildSnapshot({}));
  assert.equal(result.available, true);
  assert.deepEqual(result.periods, [
    { start: "09:00", end: "13:00" },
    { start: "14:00", end: "17:00" },
  ]);
  assert.equal(result.reasons.length, 0);
}

{
  const result = resolve(
    buildSnapshot({
      date: "2026-07-19",
      weeklyHours: [
        {
          ...weeklyMonday(),
          day_of_week: 0,
          is_closed: true,
          opens_at: null,
          closes_at: null,
        },
      ],
      breaks: [],
    }),
  );
  assert.equal(result.available, false);
  assert.ok(result.reasons.includes("weekly_closed"));
}

{
  const result = resolve(
    buildSnapshot({
      holidays: [
        {
          id: "h1",
          company_id: COMPANY_ID,
          branch_id: null,
          holiday_date: "2026-07-20",
          title: "National Day",
          created_at: "",
          updated_at: "",
          created_by: null,
          updated_by: null,
          deleted_at: null,
        },
      ],
    }),
  );
  assert.equal(result.available, false);
  assert.ok(result.reasons.includes("holiday"));
  assert.equal(result.meta.holidayTitle, "National Day");
}

{
  const result = resolve(
    buildSnapshot({
      exceptions: [
        {
          id: "ex1",
          company_id: COMPANY_ID,
          resource_id: RESOURCE_ID,
          exception_type: "vacation",
          title: "Annual Leave",
          starts_at: "2026-07-20T00:00:00.000Z",
          ends_at: "2026-07-20T23:59:59.000Z",
          all_day: true,
          notes: null,
          created_at: "",
          updated_at: "",
          created_by: null,
          updated_by: null,
          deleted_at: null,
        },
      ],
    }),
  );
  assert.equal(result.available, false);
  assert.ok(result.reasons.includes("exception_blocked"));
}

{
  const result = resolve(
    buildSnapshot({
      exceptions: [
        {
          id: "ex2",
          company_id: COMPANY_ID,
          resource_id: RESOURCE_ID,
          exception_type: "training",
          title: "Training",
          starts_at: "2026-07-20T14:00:00.000Z",
          ends_at: "2026-07-20T17:00:00.000Z",
          all_day: false,
          notes: null,
          created_at: "",
          updated_at: "",
          created_by: null,
          updated_by: null,
          deleted_at: null,
        },
      ],
    }),
  );
  assert.equal(result.available, true);
  assert.deepEqual(result.periods, [{ start: "09:00", end: "13:00" }]);
}

{
  const result = resolve(
    buildSnapshot({
      breaks: [breakRow("12:00", "12:30"), breakRow("15:00", "15:15")],
    }),
  );
  assert.deepEqual(result.periods, [
    { start: "09:00", end: "12:00" },
    { start: "12:30", end: "15:00" },
    { start: "15:15", end: "17:00" },
  ]);
}

{
  const result = resolve(
    buildSnapshot({ resource: resource({ status: "inactive" }) }),
  );
  assert.equal(result.available, false);
  assert.ok(result.reasons.includes("resource_inactive"));
}

{
  const result = resolve(
    buildSnapshot({
      serviceId: OTHER_SERVICE_ID,
      service: service({ id: OTHER_SERVICE_ID }),
      serviceCapabilityIds: [SERVICE_ID],
    }),
  );
  assert.equal(result.available, false);
  assert.ok(result.reasons.includes("capability_missing"));
}

{
  const result = resolve(buildSnapshot({ resource: null }));
  assert.ok(result.reasons.includes("resource_not_found"));
}

{
  const result = resolve(buildSnapshot({ weeklyHours: [] }));
  assert.ok(result.reasons.includes("missing_weekly_schedule"));
}

{
  const result = resolve(
    buildSnapshot({ resource: resource({ timezone: "Not/A_Timezone" }) }),
  );
  assert.ok(result.reasons.includes("invalid_timezone"));
}

{
  const weekday = TimezoneResolver.weekdayForDate("2026-07-20", "UTC");
  assert.equal(weekday, 1, "2026-07-20 is Monday in UTC");
}

{
  const result = resolve(
    buildSnapshot({ resource: resource({ timezone: "Asia/Riyadh" }) }),
  );
  assert.equal(result.timezone, "Asia/Riyadh");
  assert.equal(result.available, true);
}

{
  const blocked = resolve(
    buildSnapshot({
      date: "2027-01-01",
      options: {
        respectBookingRules: true,
        referenceNow: new Date("2026-07-20T10:00:00.000Z"),
      },
    }),
  );
  assert.ok(blocked.reasons.includes("outside_booking_window"));
}

{
  const sameDay = resolve(
    buildSnapshot({
      date: "2026-07-20",
      options: {
        respectBookingRules: true,
        referenceNow: new Date("2026-07-20T23:30:00.000Z"),
      },
      bookingRules: {
        id: "rules",
        company_id: COMPANY_ID,
        ...DEFAULT_BOOKING_RULES,
        min_booking_notice_minutes: 120,
        created_at: "",
        updated_at: "",
        created_by: null,
        updated_by: null,
      },
    }),
  );
  assert.ok(sameDay.reasons.includes("inside_minimum_notice"));
}

{
  const policy = AvailabilityPolicy.evaluate(buildSnapshot({ resource: null }));
  assert.equal(policy.blocked, true);
}

{
  const a = AvailabilityResolver.resolve(buildSnapshot({}));
  const b = AvailabilityResolver.resolve(buildSnapshot({}));
  assert.deepEqual(a, b);
}

console.log("✔ availability engine unit tests (17 scenarios)");
