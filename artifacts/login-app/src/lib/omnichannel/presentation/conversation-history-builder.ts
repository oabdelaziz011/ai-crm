import { differenceInMinutes } from "date-fns";
import type { TimelineEvent } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { Profile } from "@/lib/types";
import {
  resolveDisplayName,
  resolveTargetDisplayName,
} from "@/lib/omnichannel/presentation/resolve-display-name";
import type {
  ConversationHistoryEvent,
  ConversationHistoryEventKind,
  ConversationHistoryFilterId,
  ConversationHistoryIconKey,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";
import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";

export type ConversationHistoryLabels = Record<string, string> & {
  conversationStarted: string;
  customerFirstMessage: string;
  customerMessage: string;
  aiReplied: string;
  agentMessage: string;
  agentJoined: string;
  aiSummaryGenerated: string;
  customerCreated: string;
  bookingCreated: string;
  bookingUpdated: string;
  invoiceCreated: string;
  invoicePaid: string;
  ticketCreated: string;
  ticketResolved: string;
  queueChanged: string;
  transfer: string;
  customerLabel: string;
  aiEmployeeLabel: string;
  systemLabel: string;
  automationLabel: string;
  workflowLabel: string;
  automationAction: string;
  workflowAction: string;
  ticketClosed: string;
  badgeWorkflow?: string;
  badgeAutomation?: string;
};

type BuildHistoryInput = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  lifecycleSnapshot?: LifecycleSnapshot | null;
  customerContext?: OmnichannelCustomerContext | null;
  conversationTickets?: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  aiAssist: OmnichannelAiAssistModel;
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  labels: ConversationHistoryLabels;
  smartTimeLabels: SmartTimeLabels;
  supportAgentFallback?: string;
};

function filterForKind(kind: ConversationHistoryEventKind): ConversationHistoryFilterId {
  if (kind === "customer_first_message" || kind === "customer_message" || kind === "agent_message") {
    return "messages";
  }
  if (
    kind === "assignment"
    || kind === "human_takeover"
    || kind === "agent_joined"
    || kind === "transfer"
    || kind === "queue_change"
  ) {
    return "assignments";
  }
  if (kind === "ai_message" || kind === "ai_takeover" || kind === "ai_summary") return "ai";
  if (
    kind === "customer_linked"
    || kind === "customer_created"
    || kind === "ownership_change"
  ) {
    return "crm";
  }
  if (kind === "invoice_created" || kind === "invoice_paid") return "invoices";
  if (kind === "booking_created" || kind === "booking_updated") return "bookings";
  if (kind === "escalation" || kind === "return_escalation") return "escalations";
  if (kind === "internal_note") return "notes";
  if (kind === "ticket_created" || kind === "ticket_resolved") return "tickets";
  if (kind === "workflow_action") return "workflow";
  if (kind === "automation_action") return "automation";
  return "everything";
}

function badgeForKind(kind: ConversationHistoryEventKind, labels: ConversationHistoryLabels) {
  switch (kind) {
    case "assignment":
    case "human_takeover":
    case "agent_joined":
    case "transfer":
      return { label: labels.badgeAssignment ?? "Assignment", tone: "accent" as const };
    case "queue_change":
      return { label: labels.badgeQueue ?? "Queue", tone: "accent" as const };
    case "escalation":
    case "return_escalation":
      return { label: labels.badgeEscalation ?? "Escalation", tone: "warn" as const };
    case "internal_note":
      return { label: labels.badgeNote ?? "Note", tone: "violet" as const };
    case "ai_message":
    case "ai_takeover":
    case "ai_summary":
      return { label: labels.badgeAi ?? "AI", tone: "violet" as const };
    case "customer_linked":
    case "customer_created":
    case "ownership_change":
      return { label: labels.badgeCustomer ?? "Customer", tone: "accent" as const };
    case "booking_created":
    case "booking_updated":
      return { label: labels.badgeBooking ?? "Booking", tone: "success" as const };
    case "invoice_created":
    case "invoice_paid":
      return { label: labels.badgeInvoice ?? "Invoice", tone: "success" as const };
    case "ticket_created":
      return { label: labels.badgeTicket ?? "Ticket", tone: "warn" as const };
    case "ticket_resolved":
      return { label: labels.ticketClosed ?? labels.badgeTicket ?? "Ticket", tone: "success" as const };
    case "workflow_action":
      return { label: labels.badgeWorkflow ?? "Workflow", tone: "violet" as const };
    case "automation_action":
      return { label: labels.badgeAutomation ?? "Automation", tone: "accent" as const };
    case "conversation_resolved":
    case "conversation_reopened":
    case "conversation_closed":
      return { label: labels.badgeStatus ?? "Status", tone: "default" as const };
    default:
      return { label: labels.badgeMessage ?? "Message", tone: "default" as const };
  }
}

function iconForKind(kind: ConversationHistoryEventKind): ConversationHistoryIconKey {
  switch (kind) {
    case "conversation_started":
      return "play";
    case "customer_first_message":
    case "customer_message":
      return "message";
    case "ai_message":
    case "ai_summary":
      return "sparkles";
    case "ai_takeover":
      return "bot";
    case "agent_message":
    case "agent_joined":
    case "human_takeover":
      return "user";
    case "assignment":
      return "users";
    case "queue_change":
      return "layers";
    case "escalation":
    case "return_escalation":
      return "alert";
    case "internal_note":
      return "sticky";
    case "customer_linked":
    case "ownership_change":
      return "link";
    case "customer_created":
      return "user-plus";
    case "booking_created":
    case "booking_updated":
      return "calendar";
    case "invoice_created":
    case "invoice_paid":
      return "receipt";
    case "ticket_created":
    case "ticket_resolved":
      return "ticket";
    case "conversation_resolved":
      return "check";
    case "conversation_closed":
      return "x";
    case "conversation_reopened":
      return "refresh";
    case "transfer":
      return "shuffle";
    case "workflow_action":
      return "workflow";
    case "automation_action":
      return "automation";
    default:
      return "message";
  }
}

function actorName(
  actorId: string | null,
  actorLabel: string | null,
  actorType: ConversationHistoryEvent["actorType"],
  input: BuildHistoryInput,
): string {
  if (actorType === "customer") {
    const customer = input.conversation?.customer;
    return resolveDisplayName({
      crmName: customer?.name ?? actorLabel,
      phone: customer?.phone,
      channelName: input.conversation?.channelLabel,
      rawLabel: actorLabel,
      fallback: input.labels.customerLabel,
    }).display;
  }
  if (actorType === "ai") return input.labels.aiEmployeeLabel;
  if (actorType === "automation") return input.labels.automationLabel;
  if (actorType === "system") return input.labels.systemLabel;
  return resolveDisplayName({
    userId: actorId,
    rawLabel: actorLabel,
    agentsById: input.agentsById,
    profilesByUserId: input.profilesByUserId,
    fallback: input.supportAgentFallback ?? input.labels.customerLabel,
  }).display;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readWorkflowLabel(message: UnifiedMessage): string | null {
  const meta = message.source.metadata ?? {};
  return (
    readMetadataString(meta, "workflow_action_label")
    ?? readMetadataString(meta, "workflow_name")
    ?? readMetadataString(meta, "workflow_label")
  );
}

function makeEvent(
  partial: Omit<ConversationHistoryEvent, "searchableText" | "filterCategory" | "badgeLabel" | "badgeTone" | "iconKey">,
  input: BuildHistoryInput,
): ConversationHistoryEvent {
  const resolvedActor = actorName(partial.actorId, partial.actorLabel, partial.actorType, input);
  const badge = badgeForKind(partial.kind, input.labels);
  const customerName = input.conversation?.customer?.name?.trim() ?? "";
  const searchableText = [
    resolvedActor,
    partial.action,
    partial.target,
    partial.summary,
    partial.kind,
    customerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    ...partial,
    searchableText,
    filterCategory: filterForKind(partial.kind),
    badgeLabel: badge.label,
    badgeTone: badge.tone,
    iconKey: iconForKind(partial.kind),
    actorLabel: resolvedActor,
  };
}

function eventsFromMessages(input: BuildHistoryInput): ConversationHistoryEvent[] {
  const events: ConversationHistoryEvent[] = [];
  let firstCustomer = true;
  let firstAgent = true;

  for (const message of input.messages) {
    if (message.isInternalNote) {
      events.push(
        makeEvent(
          {
            id: `note-${message.id}`,
            kind: "internal_note",
            timestamp: message.timestamp,
            actorId: readAgentUserId(message),
            actorLabel: message.senderLabel,
            actorType: "agent",
            action: input.labels.internalNoteAdded ?? "Internal note",
            target: message.body,
            summary: message.body,
            journeyEligible: false,
          },
          input,
        ),
      );
      continue;
    }

    if (message.senderType === "customer") {
      events.push(
        makeEvent(
          {
            id: `msg-customer-${message.id}`,
            kind: firstCustomer ? "customer_first_message" : "customer_message",
            timestamp: message.timestamp,
            actorId: null,
            actorLabel: message.senderLabel,
            actorType: "customer",
            action: firstCustomer ? input.labels.customerFirstMessage : input.labels.customerMessage,
            target: message.body,
            summary: message.body,
            journeyEligible: firstCustomer,
          },
          input,
        ),
      );
      firstCustomer = false;
      continue;
    }

    if (message.senderType === "assistant") {
      events.push(
        makeEvent(
          {
            id: `msg-ai-${message.id}`,
            kind: "ai_message",
            timestamp: message.timestamp,
            actorId: null,
            actorLabel: message.senderLabel,
            actorType: "ai",
            action: input.labels.aiReplied,
            target: message.body,
            summary: message.body,
            journeyEligible: false,
          },
          input,
        ),
      );
      continue;
    }

    if (message.senderType === "agent") {
      if (firstAgent) {
        events.push(
          makeEvent(
            {
              id: `agent-joined-${message.id}`,
              kind: "agent_joined",
              timestamp: message.timestamp,
              actorId: readAgentUserId(message),
              actorLabel: message.senderLabel,
              actorType: "agent",
              action: input.labels.agentJoined,
              target: message.senderLabel,
              summary: message.senderLabel,
              assigneeUserId: readAgentUserId(message),
              journeyEligible: true,
            },
            input,
          ),
        );
        firstAgent = false;
      }
      events.push(
        makeEvent(
          {
            id: `msg-agent-${message.id}`,
            kind: "agent_message",
            timestamp: message.timestamp,
            actorId: readAgentUserId(message),
            actorLabel: message.senderLabel,
            actorType: "agent",
            action: input.labels.agentMessage,
            target: message.body,
            summary: message.body,
            journeyEligible: false,
          },
          input,
        ),
      );
      continue;
    }

    if (message.senderType === "automation") {
      events.push(
        makeEvent(
          {
            id: `automation-${message.id}`,
            kind: "automation_action",
            timestamp: message.timestamp,
            actorId: null,
            actorLabel: null,
            actorType: "automation",
            action: message.automationActionLabel ?? input.labels.automationAction,
            target: message.body || null,
            summary: message.body || message.automationActionLabel || input.labels.automationAction,
            journeyEligible: false,
          },
          input,
        ),
      );
      continue;
    }

    if (message.senderType === "system") {
      const workflowLabel = readWorkflowLabel(message);
      if (workflowLabel) {
        events.push(
          makeEvent(
            {
              id: `workflow-${message.id}`,
              kind: "workflow_action",
              timestamp: message.timestamp,
              actorId: null,
              actorLabel: null,
              actorType: "system",
              action: workflowLabel,
              target: message.body || null,
              summary: message.body || workflowLabel,
              journeyEligible: false,
            },
            input,
          ),
        );
      }
    }
  }

  return events;
}

function readAgentUserId(message: UnifiedMessage): string | null {
  const meta = message.source.metadata ?? {};
  return typeof meta.agentUserId === "string" ? meta.agentUserId : null;
}

function mapLifecycleKind(type: TimelineEvent["type"], summary: string, payload: Record<string, unknown>): ConversationHistoryEventKind {
  if (type === "assignment") {
    return payload.targetType === "queue" ? "queue_change" : "assignment";
  }
  if (type === "human_takeover") return "human_takeover";
  if (type === "ai_takeover") return "ai_takeover";
  if (type === "escalation") return "escalation";
  if (type === "internal_note") return "internal_note";
  if (type === "ownership_change") return "customer_linked";
  if (type === "close") {
    return summary.toLowerCase().includes("resolved") ? "conversation_resolved" : "conversation_closed";
  }
  if (type === "reopen") return "conversation_reopened";
  if (type === "status_change") {
    if (summary.toLowerCase().includes("returned")) return "return_escalation";
    if (summary.toLowerCase().includes("transfer")) return "transfer";
    return "status_change";
  }
  return "status_change";
}

function lifecycleAction(
  event: TimelineEvent,
  labels: ConversationHistoryLabels,
  resolvedTarget: string | null,
): { action: string; target: string | null } {
  const payload = event.payload ?? {};
  const targetType = typeof payload.targetType === "string" ? payload.targetType : null;

  switch (event.type) {
    case "assignment":
      if (targetType === "team") return { action: labels.assignedToTeam ?? labels.assignment, target: resolvedTarget };
      if (targetType === "queue") return { action: labels.queueChanged, target: resolvedTarget };
      if (targetType === "ai_employee") return { action: labels.assignedToAi ?? labels.assignment, target: resolvedTarget };
      return { action: labels.assignment ?? labels.assigned, target: resolvedTarget };
    case "human_takeover":
      return { action: labels.tookOver ?? labels.agentJoined, target: null };
    case "ai_takeover":
      return { action: labels.returnedToAi ?? labels.aiReplied, target: null };
    case "escalation":
      return { action: labels.escalated ?? labels.transfer, target: resolvedTarget };
    case "internal_note":
      return { action: labels.internalNoteAdded ?? labels.internalNote, target: resolvedTarget };
    case "ownership_change":
      return { action: labels.customerLinked ?? labels.customerCreated, target: resolvedTarget };
    case "close":
      return event.summary.toLowerCase().includes("resolved")
        ? { action: labels.resolved ?? labels.conversationResolved, target: null }
        : { action: labels.closed ?? labels.conversationClosed, target: null };
    case "reopen":
      return { action: labels.reopened ?? labels.conversationReopened, target: null };
    case "status_change":
      if (event.summary.toLowerCase().includes("returned")) {
        return { action: labels.returnedFromEscalation ?? labels.returnEscalation, target: null };
      }
      return { action: labels.statusChanged ?? labels.transfer, target: null };
    default:
      return { action: labels.statusChanged ?? labels.transfer, target: resolvedTarget };
  }
}

function eventsFromLifecycle(input: BuildHistoryInput): ConversationHistoryEvent[] {
  const timeline = input.lifecycleSnapshot?.timeline ?? [];

  return timeline.map((event) => {
    const payload = event.payload ?? {};
    const targetType = typeof payload.targetType === "string" ? payload.targetType : null;
    const targetId = typeof payload.targetId === "string" ? payload.targetId : null;
    const rawTargetLabel = typeof payload.targetLabel === "string" ? payload.targetLabel : null;
    const targetLevel = typeof payload.targetLevel === "string" ? payload.targetLevel : null;
    const resolvedTarget =
      resolveTargetLabel(targetType, targetId, targetLevel ?? rawTargetLabel, input)
      || null;

    const { action, target } = lifecycleAction(event, input.labels, resolvedTarget || null);
    const kind = mapLifecycleKind(event.type, event.summary, payload);

    return makeEvent(
      {
        id: `lifecycle-${event.id}`,
        kind,
        timestamp: event.timestamp,
        actorId: event.actorId,
        actorLabel: event.actorLabel,
        actorType: kind === "ai_takeover" ? "ai" : "agent",
        action,
        target,
        summary: target ? `${action} ${target}` : action,
        payload: event.payload,
        assigneeUserId: targetType === "user" ? targetId : null,
        assigneeAiEmployeeId: targetType === "ai_employee" ? targetId : null,
        opensCustomer360: kind === "customer_linked",
        journeyEligible: [
          "assignment",
          "escalation",
          "return_escalation",
          "customer_linked",
          "conversation_resolved",
          "conversation_closed",
          "human_takeover",
          "queue_change",
        ].includes(kind),
      },
      input,
    );
  });
}

function eventsFromConversationStart(input: BuildHistoryInput): ConversationHistoryEvent[] {
  const record = input.conversation?.source;
  if (!record?.created_at) return [];
  const channel = input.conversation?.channelLabel ?? record.channel_type;
  return [
    makeEvent(
      {
        id: `started-${record.id}`,
        kind: "conversation_started",
        timestamp: record.created_at,
        actorId: null,
        actorLabel: null,
        actorType: "system",
        action: input.labels.conversationStarted,
        target: channel,
        summary: `${input.labels.conversationStarted} · ${channel}`,
        journeyEligible: true,
      },
      input,
    ),
  ];
}

function eventsFromCrmContext(input: BuildHistoryInput): ConversationHistoryEvent[] {
  const events: ConversationHistoryEvent[] = [];
  const record = input.conversation?.source;
  const baseTime = record?.created_at ?? new Date().toISOString();
  const ctx = input.customerContext;

  if (input.conversation?.customer?.id && record?.customer_id) {
    const linkedAt =
      typeof record.metadata?.customerLinkedAt === "string"
        ? record.metadata.customerLinkedAt
        : baseTime;
    if (!input.lifecycleSnapshot?.timeline.some((event) => event.type === "ownership_change")) {
      events.push(
        makeEvent(
          {
            id: `crm-linked-${record.id}`,
            kind: "customer_linked",
            timestamp: linkedAt,
            actorId: null,
            actorLabel: null,
            actorType: "system",
            action: input.labels.customerLinked ?? "Customer linked",
            target: input.conversation.customer.name,
            summary: input.conversation.customer.name,
            opensCustomer360: true,
            journeyEligible: true,
          },
          input,
        ),
      );
    }
  }

  if ((ctx?.recentBookings ?? 0) > 0) {
    events.push(
      makeEvent(
        {
          id: `crm-booking-${record?.id ?? "x"}`,
          kind: "booking_created",
          timestamp: baseTime,
          actorId: null,
          actorLabel: null,
          actorType: "system",
          action: input.labels.bookingCreated,
          target: String(ctx?.recentBookings),
          summary: input.labels.bookingCreated,
          journeyEligible: true,
        },
        input,
      ),
    );
  }

  if ((ctx?.outstandingInvoices ?? 0) > 0) {
    events.push(
      makeEvent(
        {
          id: `crm-invoice-${record?.id ?? "x"}`,
          kind: "invoice_created",
          timestamp: baseTime,
          actorId: null,
          actorLabel: null,
          actorType: "system",
          action: input.labels.invoiceCreated,
          target: String(ctx?.outstandingInvoices),
          summary: input.labels.invoiceCreated,
          journeyEligible: true,
        },
        input,
      ),
    );
  }

  if ((input.conversationTickets ?? []).length > 0) {
    for (const ticket of input.conversationTickets ?? []) {
      const isClosed = ticket.status === "closed" || ticket.status === "resolved";
      events.push(
        makeEvent(
          {
            id: `ticket-${ticket.id}`,
            kind: isClosed ? "ticket_resolved" : "ticket_created",
            timestamp: isClosed ? ticket.updatedAt : ticket.createdAt,
            actorId: null,
            actorLabel: null,
            actorType: "system",
            action: isClosed ? input.labels.ticketClosed : input.labels.ticketCreated,
            target: ticket.ticketNumber,
            summary: `${ticket.ticketNumber} · ${ticket.subject}`,
            journeyEligible: true,
          },
          input,
        ),
      );
    }
  } else if ((ctx?.openTickets ?? 0) > 0) {
    events.push(
      makeEvent(
        {
          id: `crm-ticket-${record?.id ?? "x"}`,
          kind: "ticket_created",
          timestamp: baseTime,
          actorId: null,
          actorLabel: null,
          actorType: "system",
          action: input.labels.ticketCreated,
          target: String(ctx?.openTickets),
          summary: input.labels.ticketCreated,
          journeyEligible: true,
        },
        input,
      ),
    );
  }

  return events;
}

function eventsFromAiSummary(input: BuildHistoryInput): ConversationHistoryEvent[] {
  if (!input.aiAssist.summary?.trim()) return [];
  const lastMessageAt = input.messages.at(-1)?.timestamp ?? new Date().toISOString();
  return [
    makeEvent(
      {
        id: `ai-summary-${input.conversation?.id ?? "x"}`,
        kind: "ai_summary",
        timestamp: lastMessageAt,
        actorId: null,
        actorLabel: null,
        actorType: "ai",
        action: input.labels.aiSummaryGenerated,
        target: input.aiAssist.summary.slice(0, 80),
        summary: input.aiAssist.summary,
        journeyEligible: false,
      },
      input,
    ),
  ];
}

function dedupeEvents(events: ConversationHistoryEvent[]): ConversationHistoryEvent[] {
  const seen = new Set<string>();
  const unique: ConversationHistoryEvent[] = [];
  for (const event of events) {
    const key = `${event.kind}:${event.timestamp}:${event.summary.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

export function buildConversationHistory(input: BuildHistoryInput): ConversationHistoryEvent[] {
  const merged = dedupeEvents([
    ...eventsFromConversationStart(input),
    ...eventsFromMessages(input),
    ...eventsFromLifecycle(input),
    ...eventsFromCrmContext(input),
    ...eventsFromAiSummary(input),
  ]);

  return merged.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function computeAverageResponseTimeMinutes(messages: UnifiedMessage[]): number | null {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1];
    const current = sorted[index];
    if (prev.senderType === "customer" && (current.senderType === "agent" || current.senderType === "assistant")) {
      gaps.push(Math.max(0, differenceInMinutes(new Date(current.timestamp), new Date(prev.timestamp))));
    }
  }
  if (gaps.length === 0) return null;
  return Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
}

export function resolveTargetLabel(
  targetType: string | null | undefined,
  targetId: string | null | undefined,
  targetLabel: string | null | undefined,
  input: Pick<BuildHistoryInput, "agentsById" | "profilesByUserId" | "supportAgentFallback">,
): string | null {
  return resolveTargetDisplayName(targetType ?? undefined, targetId ?? undefined, targetLabel ?? undefined, {
    agentsById: input.agentsById,
    profilesByUserId: input.profilesByUserId,
    fallback: input.supportAgentFallback,
  });
}
