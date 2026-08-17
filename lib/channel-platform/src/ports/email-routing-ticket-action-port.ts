import type {
  EmailRoutingClassificationRuntime,
  EmailRoutingDecisionRuntime,
} from "./email-routing-classifier-port.js";

export type EmailRoutingTicketActionRuntimeResult = {
  status: "skipped" | "reused" | "created" | "failed";
  reason: string;
  ticketId: string | null;
  ticketNumber?: string;
  assignedUserId: string | null;
  targetType?: string;
  targetId?: string | null;
};

/**
 * Applies Sprint 4 emailRoutingDecision to the existing ticket platform.
 * Must not re-classify or call an LLM.
 */
export type EmailRoutingTicketActionPort = {
  apply(input: {
    companyId: string;
    conversationId: string;
    inboundEventId: string;
    subject?: string | null;
    bodyPreview?: string | null;
    classification: EmailRoutingClassificationRuntime;
    decision: EmailRoutingDecisionRuntime;
  }): Promise<EmailRoutingTicketActionRuntimeResult>;
};
