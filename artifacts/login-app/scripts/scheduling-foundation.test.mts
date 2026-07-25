import assert from "node:assert/strict";
import {
  bookingRulesFormSchema,
  holidayFormSchema,
  resourceFormSchema,
  weeklyScheduleSchema,
} from "../src/lib/scheduling/validation/schemas.ts";
import { DEFAULT_WEEKLY_HOURS } from "../src/lib/scheduling/types.ts";

const resource = resourceFormSchema.safeParse({
  name: "Treatment Room A",
  resource_type: "room",
  branch_id: null,
  status: "active",
  timezone: "Asia/Riyadh",
  description: null,
});
assert.equal(resource.success, true, "resource form should validate");

const weekly = weeklyScheduleSchema.safeParse({ days: DEFAULT_WEEKLY_HOURS });
assert.equal(weekly.success, true, "default weekly schedule should validate");

const rules = bookingRulesFormSchema.safeParse({
  min_booking_notice_minutes: 60,
  max_booking_window_days: 90,
  buffer_before_minutes: 5,
  buffer_after_minutes: 10,
  slot_interval_minutes: 15,
  min_cancellation_notice_minutes: 240,
  min_reschedule_notice_minutes: 720,
  allow_overbooking: false,
  timezone: "Africa/Cairo",
  week_start_day: 1,
});
assert.equal(rules.success, true, "booking rules should validate");

const invalidTimezone = bookingRulesFormSchema.safeParse({
  min_booking_notice_minutes: 60,
  max_booking_window_days: 90,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  slot_interval_minutes: 15,
  min_cancellation_notice_minutes: 0,
  min_reschedule_notice_minutes: 0,
  allow_overbooking: false,
  timezone: "Not/A_Timezone",
  week_start_day: 1,
});
assert.equal(invalidTimezone.success, false, "invalid timezone should fail");

const negativeNotice = bookingRulesFormSchema.safeParse({
  min_booking_notice_minutes: -1,
  max_booking_window_days: 90,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  slot_interval_minutes: 15,
  min_cancellation_notice_minutes: 0,
  min_reschedule_notice_minutes: 0,
  allow_overbooking: false,
  timezone: "UTC",
  week_start_day: 1,
});
assert.equal(negativeNotice.success, false, "negative notice should fail");

const holiday = holidayFormSchema.safeParse({
  holiday_date: "2026-12-25",
  title: "National Day",
  branch_id: null,
});
assert.equal(holiday.success, true, "holiday form should validate");

console.log("✔ scheduling validation schemas");
