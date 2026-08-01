import type { ConversationRecord } from "@workspace/ai-conversation";
import type {
  OmnichannelAgentRef,
  OmnichannelCustomerRef,
  UnifiedConversation,
} from "@/lib/omnichannel/types/unified-conversation";
import type { AssignmentTargetType } from "../types/lifecycle-types.js";
import type { ConversationHeader } from "../types/lifecycle-types.js";
import { resolveLifecycleState } from "../adapters/backend-state-adapter.js";
import { resolveConversationOwner } from "./ownership-engine.js";
import { conversationLifecycleEngine } from "./conversation-lifecycle-engine.js";
import { getActiveEscalation } from "./escalation-engine.js";
import { readLifecycleOverlay } from "../adapters/backend-state-adapter.js";

export type HeaderBuildInput = {
  conversation: ConversationRecord | UnifiedConversation;
  customer?: OmnichannelCustomerRef | null;
  assignedAgent?: OmnichannelAgentRef | null;
  assignedTeam?: { id: string; name: string } | null;
  aiEmployee?: { id: string; name: string } | null;
  language?: string;
  channelLabel?: string;
  operationalAssignment?: {
    targetType: AssignmentTargetType;
    targetId: string;
    targetLabel: string;
  } | null;
  activeQueueId?: string | null;
  queueLabel?: string | null;
};

function extractRecord(input: HeaderBuildInput): ConversationRecord {
  if ("source" in input.conversation) return input.conversation.source;
  return input.conversation;
}

export function buildConversationHeader(input: HeaderBuildInput): ConversationHeader {
  const record = extractRecord(input);
  const overlay = readLifecycleOverlay(record.metadata);
  const hasActiveEscalation = getActiveEscalation(record.metadata) != null;

  const context = {
    conversationId: record.id,
    backendState: record.state,
    assignedUserId: record.assigned_user_id,
    aiAssistantId: record.ai_assistant_id,
    metadata: record.metadata,
    operationalAssignment: input.operationalAssignment ?? null,
    activeQueueId: input.activeQueueId ?? overlay?.queueId ?? null,
    hasActiveEscalation,
    lastParticipantType: record.last_participant_type,
  };

  const lifecycleState = conversationLifecycleEngine.resolveState(context);
  const owner = resolveConversationOwner(context);

  const customer = input.customer ?? null;
  const assignedAgent =
    input.assignedAgent ??
    (record.assigned_user_id
      ? { id: record.assigned_user_id, name: record.assigned_user_id }
      : null);

  const tags = overlay?.tags ?? [];
  const slaDueAt = overlay?.slaDueAt ?? null;

  return {
    conversationId: record.id,
    customer: {
      id: customer?.id ?? record.customer_id,
      name: customer?.name ?? "Unknown",
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
    },
    language: input.language ?? "auto",
    channel: record.channel_type,
    channelLabel: input.channelLabel ?? record.channel_type.replace(/_/g, " "),
    priority: record.priority,
    queueId: input.activeQueueId ?? overlay?.queueId ?? null,
    queueLabel: input.queueLabel ?? null,
    owner,
    assignedUser: assignedAgent,
    assignedTeam: input.assignedTeam ?? null,
    aiEmployee: input.aiEmployee ?? {
      id: record.ai_assistant_id,
      name: "AI Employee",
    },
    lifecycleState,
    backendState: record.state,
    sla: {
      dueAt: slaDueAt,
      breached: slaDueAt ? new Date(slaDueAt).getTime() < Date.now() : false,
      label: slaDueAt ? `Due ${new Date(slaDueAt).toLocaleString()}` : null,
    },
    tags,
    conversationNumber: record.conversation_number,
    unreadCount: record.unread_count_employee,
  };
}

/** Ensures header fields are sourced once — no duplicate derivation in UI. */
export function assertHeaderConsistency(header: ConversationHeader): string[] {
  const issues: string[] = [];
  if (header.lifecycleState === "ASSIGNED" && !header.assignedUser && header.owner.kind !== "user") {
    issues.push("ASSIGNED state without assigned user or user owner");
  }
  if (header.lifecycleState === "ESCALATED" && header.owner.kind === "unassigned") {
    issues.push("ESCALATED state with unassigned owner");
  }
  if (header.lifecycleState === "AI_HANDLING" && header.owner.kind === "user") {
    issues.push("AI_HANDLING state with user owner");
  }
  return issues;
}
