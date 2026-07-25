import { z } from "zod";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  SCHEDULING_EXCEPTION_TYPES,
  SCHEDULING_RESOURCE_STATUSES,
  SCHEDULING_RESOURCE_TYPES,
  WEEKDAY_INDICES,
  type WeekdayIndex,
} from "@/lib/scheduling/types";

const weekdayIndexSchema = z.custom<WeekdayIndex>(
  (value): value is WeekdayIndex =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    WEEKDAY_INDICES.includes(value as WeekdayIndex),
  { message: "scheduling.validation.invalidWeekday" },
);

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const resourceFormSchema = z.object({
  name: z.string().trim().min(1, "scheduling.validation.resourceNameRequired").max(120),
  resource_type: z.enum(SCHEDULING_RESOURCE_TYPES),
  branch_id: z.string().uuid().nullable().optional(),
  status: z.enum(SCHEDULING_RESOURCE_STATUSES).default("active"),
  timezone: z.string().trim().min(1, "scheduling.validation.timezoneRequired"),
  description: z.string().trim().max(2000).nullable().optional(),
});

export type ResourceFormValues = z.infer<typeof resourceFormSchema>;

export const breakSchema = z
  .object({
    id: z.string().uuid().optional(),
    starts_at: z.string().regex(timePattern, "scheduling.validation.invalidTime"),
    ends_at: z.string().regex(timePattern, "scheduling.validation.invalidTime"),
    label: z.string().trim().max(120).nullable().optional(),
  })
  .refine((value) => value.starts_at < value.ends_at, {
    message: "scheduling.validation.breakEndAfterStart",
    path: ["ends_at"],
  });

export const weeklyDaySchema = z
  .object({
    day_of_week: weekdayIndexSchema,
    is_closed: z.boolean(),
    opens_at: z.string().regex(timePattern).nullable().optional(),
    closes_at: z.string().regex(timePattern).nullable().optional(),
    breaks: z.array(breakSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (!WEEKDAY_INDICES.includes(value.day_of_week as (typeof WEEKDAY_INDICES)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduling.validation.invalidWeekday",
        path: ["day_of_week"],
      });
    }
    if (value.is_closed) return;
    if (!value.opens_at || !value.closes_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduling.validation.hoursRequiredWhenOpen",
        path: ["opens_at"],
      });
      return;
    }
    if (value.opens_at >= value.closes_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduling.validation.closeAfterOpen",
        path: ["closes_at"],
      });
    }
  });

export const weeklyScheduleSchema = z.object({
  days: z.array(weeklyDaySchema).length(7),
});

export type WeeklyScheduleFormValues = z.infer<typeof weeklyScheduleSchema>;

export const exceptionFormSchema = z
  .object({
    exception_type: z.enum(SCHEDULING_EXCEPTION_TYPES),
    title: z.string().trim().min(1, "scheduling.validation.exceptionTitleRequired").max(200),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    all_day: z.boolean().default(false),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => new Date(value.starts_at) < new Date(value.ends_at), {
    message: "scheduling.validation.exceptionEndAfterStart",
    path: ["ends_at"],
  });

export type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;

export const bookingRulesFormSchema = z
  .object({
    min_booking_notice_minutes: z.coerce.number().int().min(0).max(60 * 24 * 30),
    max_booking_window_days: z.coerce.number().int().min(1).max(365),
    buffer_before_minutes: z.coerce.number().int().min(0).max(480),
    buffer_after_minutes: z.coerce.number().int().min(0).max(480),
    slot_interval_minutes: z.coerce.number().int().min(5).max(480),
    min_cancellation_notice_minutes: z.coerce.number().int().min(0).max(60 * 24 * 30),
    min_reschedule_notice_minutes: z.coerce.number().int().min(0).max(60 * 24 * 30),
    allow_overbooking: z.boolean(),
    timezone: z.string().trim().min(1, "scheduling.validation.timezoneRequired"),
    week_start_day: weekdayIndexSchema,
  })
  .refine((value) => TimezoneResolver.isValid(value.timezone), {
    message: "scheduling.validation.invalidTimezone",
    path: ["timezone"],
  });

export type BookingRulesFormValues = z.infer<typeof bookingRulesFormSchema>;

export const holidayFormSchema = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduling.validation.invalidDate"),
  title: z.string().trim().min(1, "scheduling.validation.holidayTitleRequired").max(200),
  branch_id: z.string().uuid().nullable().optional(),
});

export type HolidayFormValues = z.infer<typeof holidayFormSchema>;

export function formatZodError(
  error: z.ZodError,
  translate: (key: string) => string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    const messageKey = issue.message.startsWith("scheduling.")
      ? issue.message
      : "scheduling.validation.generic";
    result[key] = translate(messageKey);
  }
  return result;
}
