import { isSlaBreached, isSlaWarning, DEFAULT_SLA_WARNING_HOURS } from "@workspace/ticket-platform";
import { formatSlaRemainingLabel } from "@/lib/omnichannel/presentation/lifecycle-timeline-presentation";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";

/**
 * Omnichannel SLA presentation — ticket-centric.
 * Reads SLA only from linked active support ticket context.
 * Stale conversation metadata.lifecycle.slaDueAt is intentionally ignored.
 */

export type ConversationSlaUiState =
  | "healthy"
  | "at_risk"
  | "breached"
  | "completed"
  | "unavailable";

export type ConversationSlaPresentation = {
  state: ConversationSlaUiState;
  dueAt: string | null;
  shortLabel: string;
  detailLabel: string;
  tone: "neutral" | "ok" | "warn" | "danger";
};

export type ConversationSlaLabels = {
  prefix: string;
  remainingMinutes: (count: number) => string;
  remainingHours: (count: number) => string;
  breached: string;
  atRisk: string;
  notSet: string;
  completed: string;
};

const TERMINAL_LIFECYCLE: ReadonlySet<LifecycleState> = new Set(["RESOLVED", "CLOSED"]);

/**
 * Authoritative SLA due for Omnichannel: active ticket only.
 * Never falls back to conversation metadata (stale false SLA).
 */
export function readConversationSlaDueAt(
  conversation: UnifiedConversation | null | undefined,
): string | null {
  const ticket = conversation?.ticketContext;
  if (!ticket?.isActive) return null;
  const due = ticket.slaDueAt?.trim();
  return due || null;
}

export function resolveConversationSlaPresentation(input: {
  dueAt: string | null | undefined;
  lifecycleState?: LifecycleState | null;
  labels: ConversationSlaLabels;
  now?: Date;
  warningHours?: number;
}): ConversationSlaPresentation {
  const now = input.now ?? new Date();
  const dueAt = input.dueAt?.trim() ? input.dueAt : null;
  const warningHours = input.warningHours ?? DEFAULT_SLA_WARNING_HOURS;
  const prefix = input.labels.prefix;

  if (!dueAt) {
    return {
      state: "unavailable",
      dueAt: null,
      shortLabel: `${prefix} —`,
      detailLabel: input.labels.notSet,
      tone: "neutral",
    };
  }

  const terminal = input.lifecycleState ? TERMINAL_LIFECYCLE.has(input.lifecycleState) : false;
  if (terminal) {
    const breachedAtClose = isSlaBreached(dueAt, now);
    return {
      state: "completed",
      dueAt,
      shortLabel: breachedAtClose ? `${prefix} ${input.labels.breached}` : `${prefix} ✓`,
      detailLabel: breachedAtClose ? input.labels.breached : input.labels.completed,
      tone: breachedAtClose ? "danger" : "ok",
    };
  }

  if (isSlaBreached(dueAt, now)) {
    return {
      state: "breached",
      dueAt,
      shortLabel: `${prefix} ${input.labels.breached}`,
      detailLabel: input.labels.breached,
      tone: "danger",
    };
  }

  const remaining = formatSlaRemainingLabel(
    dueAt,
    {
      remainingMinutes: input.labels.remainingMinutes,
      remainingHours: input.labels.remainingHours,
      breached: input.labels.breached,
      notSet: input.labels.notSet,
    },
    now,
  );

  if (isSlaWarning(dueAt, now, warningHours)) {
    return {
      state: "at_risk",
      dueAt,
      shortLabel: `${prefix} ${remaining}`,
      detailLabel: `${input.labels.atRisk} · ${remaining}`,
      tone: "warn",
    };
  }

  return {
    state: "healthy",
    dueAt,
    shortLabel: `${prefix} ${remaining}`,
    detailLabel: remaining,
    tone: "ok",
  };
}
