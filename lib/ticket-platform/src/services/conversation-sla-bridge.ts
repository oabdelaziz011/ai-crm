import type { TicketPriority } from "../types/ticket-types.js";
import type { TicketSlaSettingsPort } from "../ports/ticket-platform-ports.js";
import {
  computeSlaDueAt,
  resolveSlaHoursByPriority,
  type TicketSlaSettings,
} from "./ticket-sla-service.js";

const LIFECYCLE_KEY = "lifecycle";

export type ConversationSlaPriority = TicketPriority;

function asTicketPriority(priority: string | null | undefined): TicketPriority {
  if (priority === "urgent" || priority === "high" || priority === "low" || priority === "normal") {
    return priority;
  }
  return "normal";
}

function readLifecycleObject(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const raw = metadata?.[LIFECYCLE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

/** Read existing overlay slaDueAt without inventing values. */
export function readLifecycleSlaDueAt(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const due = readLifecycleObject(metadata).slaDueAt;
  return typeof due === "string" && due.trim() ? due : null;
}

/**
 * Merge ticket-derived SLA due into metadata.lifecycle without dropping other overlay fields.
 * Does not invent due times — caller must pass a real ISO dueAt from Ticket SLA.
 */
export function mergeLifecycleSlaDueAt(
  metadata: Record<string, unknown> | null | undefined,
  slaDueAt: string,
  options?: { onlyIfMissing?: boolean },
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  const lifecycle = readLifecycleObject(base);
  if (options?.onlyIfMissing) {
    const existing = lifecycle.slaDueAt;
    if (typeof existing === "string" && existing.trim()) {
      return base;
    }
  }
  return {
    ...base,
    [LIFECYCLE_KEY]: {
      ...lifecycle,
      slaDueAt,
    },
  };
}

/**
 * Ticket SLA calculator wrapper (same hours + computeSlaDueAt as TicketCommandService).
 * Prefer calling this only when mirroring a real support ticket SLA — never for conversation create alone.
 */
export async function resolveAuthoritativeConversationSlaDueAt(input: {
  companyId: string;
  priority?: string | null;
  slaSettings: TicketSlaSettingsPort | null | undefined;
  /** Ticket semantics: clock starts at create/reopen/priority-change reference time. */
  referenceNow?: Date;
}): Promise<string> {
  const settings: TicketSlaSettings | null =
    (await input.slaSettings?.getByCompanyId(input.companyId)) ?? null;
  const priority = asTicketPriority(input.priority);
  return computeSlaDueAt(
    priority,
    input.referenceNow ?? new Date(),
    resolveSlaHoursByPriority(settings),
  );
}

/**
 * Mirror an existing Ticket SLA dueAt into conversation metadata (compatibility only).
 * Without `ticketSlaDueAt`, does NOT invent conversation SLA — returns metadata unchanged.
 *
 * Authoritative SLA always lives on the support ticket. Conversation metadata is never the source of truth.
 */
export async function ensureConversationMetadataSlaDueAt(input: {
  metadata: Record<string, unknown> | null | undefined;
  companyId: string;
  priority?: string | null;
  slaSettings: TicketSlaSettingsPort | null | undefined;
  referenceNow?: Date;
  onlyIfMissing?: boolean;
  /**
   * Required to write. Must be the ticket's persisted `sla_due_at` (or freshly computed ticket SLA).
   * When omitted, no SLA is invented for the conversation.
   */
  ticketSlaDueAt?: string | null;
}): Promise<{ metadata: Record<string, unknown>; slaDueAt: string | null; wrote: boolean }> {
  const ticketDue = typeof input.ticketSlaDueAt === "string" ? input.ticketSlaDueAt.trim() : "";
  if (!ticketDue) {
    const existing = readLifecycleSlaDueAt(input.metadata);
    return {
      metadata: { ...(input.metadata ?? {}) },
      slaDueAt: existing,
      wrote: false,
    };
  }

  if (input.onlyIfMissing) {
    const existing = readLifecycleSlaDueAt(input.metadata);
    if (existing) {
      return { metadata: { ...(input.metadata ?? {}) }, slaDueAt: existing, wrote: false };
    }
  }

  return {
    metadata: mergeLifecycleSlaDueAt(input.metadata, ticketDue, { onlyIfMissing: false }),
    slaDueAt: ticketDue,
    wrote: true,
  };
}

/**
 * Conversation priority changes must NOT invent or recalculate SLA.
 * Ticket priority changes remain the only SLA recalculation path (TicketCommandService).
 */
export function createConversationPrioritySlaHook(_input: {
  slaSettings: TicketSlaSettingsPort | null | undefined;
}): {
  afterPriorityChange(args: {
    companyId: string;
    priority: string;
    metadata: Record<string, unknown>;
    referenceNow: Date;
  }): Promise<Record<string, unknown>>;
} {
  return {
    async afterPriorityChange(args) {
      return args.metadata ?? {};
    },
  };
}
