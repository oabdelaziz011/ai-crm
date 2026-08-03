import type { HandoffDomainEvent } from "../events/handoff-event-factory.js";

export interface HandoffEventPublisherPort {
  publish(event: HandoffDomainEvent): Promise<void>;
}

export type HandoffNotificationKind =
  | "transfer"
  | "assignment"
  | "escalation"
  | "queue_joined"
  | "acceptance"
  | "rejection"
  | "return_to_ai"
  | "supervisor_alert";

export type HandoffNotificationInput = {
  kind: HandoffNotificationKind;
  companyId: string;
  conversationId: string;
  actorUserId: string | null;
  recipientUserId?: string | null;
  queueId?: string | null;
  metadata?: Record<string, unknown>;
};

export interface HandoffNotificationPort {
  notify(input: HandoffNotificationInput): Promise<void>;
}

export type HandoffAuditInput = {
  companyId: string;
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  entityId: string;
  metadata: Record<string, unknown>;
};

export interface HandoffAuditPort {
  write(input: HandoffAuditInput): Promise<void>;
}

/** Delegates conversation mutations to ai-conversation — no duplicated logic. */
export interface HandoffConversationPort {
  assignConversation(input: {
    companyId: string;
    conversationId: string;
    assignedUserId: string;
    actorUserId: string | null;
  }): Promise<void>;

  releaseConversation(input: {
    companyId: string;
    conversationId: string;
    actorUserId: string | null;
  }): Promise<void>;

  closeConversation(input: {
    companyId: string;
    conversationId: string;
    actorUserId: string | null;
  }): Promise<void>;

  updateMetadata(input: {
    companyId: string;
    conversationId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;

  getConversation(input: {
    companyId: string;
    conversationId: string;
  }): Promise<{
    id: string;
    companyId: string;
    aiAssistantId: string | null;
    assignedUserId: string | null;
    customerId: string | null;
    state: string;
    metadata: Record<string, unknown>;
    channelType: string;
    priority: string;
  } | null>;
}

/** Assembles context transfer packages from external read models. */
export interface HandoffContextAssemblyPort {
  buildContext(input: {
    companyId: string;
    conversationId: string;
    reasonForEscalation?: string;
    runtimeMetadata?: Record<string, unknown>;
  }): Promise<{
    summary: string;
    suggestedResolution: string;
    suggestedReply: string;
    payload: import("../types/handoff-types.js").HandoffContextPayload;
    openTickets: unknown[];
    appointments: unknown[];
  }>;
}

export interface HandoffAgentResolverPort {
  resolveAgentLabel(userId: string): Promise<string>;
  loadAgentLabels(userIds: string[]): Promise<Map<string, string>>;
}
