import type { AutomationContext, AutomationSchedule } from "@/lib/automation/types";

export type ScheduledExecution = {
  scheduledAt: string;
  shouldSchedule: boolean;
  delayConfig: Record<string, unknown>;
};

/** Computes schedule timestamps — stores only, does not run background jobs. */
export class DelayScheduler {
  resolve(schedule: AutomationSchedule, context: AutomationContext, baseTime = new Date()): ScheduledExecution {
    if (schedule.type === "immediate") {
      return {
        scheduledAt: baseTime.toISOString(),
        shouldSchedule: false,
        delayConfig: { type: schedule.type },
      };
    }

    const scheduledAt = this.computeScheduledAt(schedule, context, baseTime);
    return {
      scheduledAt,
      shouldSchedule: scheduledAt > baseTime.toISOString(),
      delayConfig: { ...schedule },
    };
  }

  isDue(scheduledAt: string, now = new Date()): boolean {
    return new Date(scheduledAt).getTime() <= now.getTime();
  }

  private computeScheduledAt(
    schedule: AutomationSchedule,
    context: AutomationContext,
    baseTime: Date,
  ): string {
    switch (schedule.type) {
      case "after_minutes":
        return new Date(baseTime.getTime() + (schedule.minutes ?? 0) * 60_000).toISOString();
      case "after_hours":
        return new Date(baseTime.getTime() + (schedule.hours ?? 0) * 3_600_000).toISOString();
      case "after_days":
        return new Date(baseTime.getTime() + (schedule.days ?? 0) * 86_400_000).toISOString();
      case "before_appointment": {
        const appointment = context.appointmentAt ? new Date(context.appointmentAt) : baseTime;
        const offsetMs = (schedule.beforeMinutes ?? 0) * 60_000;
        return new Date(appointment.getTime() - offsetMs).toISOString();
      }
      case "at_specific_time": {
        if (!schedule.atTime) return baseTime.toISOString();
        const [hours, minutes] = schedule.atTime.split(":").map(Number);
        const target = new Date(baseTime);
        target.setHours(hours ?? 0, minutes ?? 0, 0, 0);
        if (target <= baseTime) target.setDate(target.getDate() + 1);
        return target.toISOString();
      }
      default:
        return baseTime.toISOString();
    }
  }
}

export const delayScheduler = new DelayScheduler();
