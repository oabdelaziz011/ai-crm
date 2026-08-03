import type { HANDOFF_DOMAIN_EVENTS } from "../constants.js";
import type { HandoffRequestRecord, OwnershipRecord } from "../types/handoff-types.js";

export type HandoffDomainEventType = (typeof HANDOFF_DOMAIN_EVENTS)[number];

export type HandoffDomainEvent = {
  type: HandoffDomainEventType;
  companyId: string;
  conversationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export function createOwnerChangedEvent(input: {
  companyId: string;
  conversationId: string;
  previousOwnerType: string | null;
  previousOwnerId: string | null;
  newOwnerType: string;
  newOwnerId: string | null;
  action: string;
  actorUserId: string | null;
}): HandoffDomainEvent {
  return {
    type: "owner_changed",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      previousOwnerType: input.previousOwnerType,
      previousOwnerId: input.previousOwnerId,
      newOwnerType: input.newOwnerType,
      newOwnerId: input.newOwnerId,
      action: input.action,
      actorUserId: input.actorUserId,
    },
  };
}

export function createConversationTransferredEvent(input: {
  companyId: string;
  conversationId: string;
  fromOwnerType: string | null;
  toOwnerType: string;
  toOwnerId: string | null;
  toQueueId: string | null;
  actorUserId: string | null;
  reason: string;
}): HandoffDomainEvent {
  return {
    type: "conversation_transferred",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      fromOwnerType: input.fromOwnerType,
      toOwnerType: input.toOwnerType,
      toOwnerId: input.toOwnerId,
      toQueueId: input.toQueueId,
      actorUserId: input.actorUserId,
      reason: input.reason,
    },
  };
}

export function createConversationAcceptedEvent(input: {
  companyId: string;
  conversationId: string;
  requestId: string;
  acceptedByUserId: string;
}): HandoffDomainEvent {
  return {
    type: "conversation_accepted",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      requestId: input.requestId,
      acceptedByUserId: input.acceptedByUserId,
    },
  };
}

export function createConversationRejectedEvent(input: {
  companyId: string;
  conversationId: string;
  requestId: string;
  rejectedByUserId: string;
  reason: string;
}): HandoffDomainEvent {
  return {
    type: "conversation_rejected",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      requestId: input.requestId,
      rejectedByUserId: input.rejectedByUserId,
      reason: input.reason,
    },
  };
}

export function createConversationEscalatedEvent(input: {
  companyId: string;
  conversationId: string;
  escalationReasonCode: string;
  targetQueueId: string | null;
  actorUserId: string | null;
  request: HandoffRequestRecord;
}): HandoffDomainEvent {
  return {
    type: "conversation_escalated",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      escalationReasonCode: input.escalationReasonCode,
      targetQueueId: input.targetQueueId,
      actorUserId: input.actorUserId,
      requestId: input.request.id,
    },
  };
}

export function createConversationReturnedToAiEvent(input: {
  companyId: string;
  conversationId: string;
  actorUserId: string | null;
  ownership: OwnershipRecord;
}): HandoffDomainEvent {
  return {
    type: "conversation_returned_to_ai",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      actorUserId: input.actorUserId,
      aiAssistantId: input.ownership.aiAssistantId,
    },
  };
}

export function createQueueJoinedEvent(input: {
  companyId: string;
  conversationId: string;
  queueId: string;
  queueName: string;
  position: number;
}): HandoffDomainEvent {
  return {
    type: "queue_joined",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      queueId: input.queueId,
      queueName: input.queueName,
      position: input.position,
    },
  };
}

export function createQueueLeftEvent(input: {
  companyId: string;
  conversationId: string;
  queueId: string;
  reason: string;
}): HandoffDomainEvent {
  return {
    type: "queue_left",
    companyId: input.companyId,
    conversationId: input.conversationId,
    occurredAt: new Date().toISOString(),
    payload: {
      queueId: input.queueId,
      reason: input.reason,
    },
  };
}
