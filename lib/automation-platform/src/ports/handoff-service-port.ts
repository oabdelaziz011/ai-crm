export type HandoffEscalationTrigger =
  | "low_confidence"
  | "customer_requested"
  | "sensitive_topic"
  | "billing"
  | "complaint"
  | "repeated_failures"
  | "policy_violation"
  | "manual";

export const HANDOFF_ESCALATION_TRIGGERS: readonly HandoffEscalationTrigger[] = [
  "low_confidence",
  "customer_requested",
  "sensitive_topic",
  "billing",
  "complaint",
  "repeated_failures",
  "policy_violation",
  "manual",
] as const;

export type RequestCustomerHandoffInput = {
  companyId: string;
  conversationId: string;
  triggerCode?: HandoffEscalationTrigger;
  queueId?: string;
  reason?: string;
  aiAssistantId?: string | null;
};

export type RequestCustomerHandoffResult = {
  ownership: {
    ownerType: string;
    ownerLabel: string;
    assignedUserId?: string | null;
    queueId?: string | null;
    lifecycleState?: string | null;
  };
  assigned: boolean;
  queued: boolean;
  assigneeUserId?: string;
  queueId?: string;
  idempotent?: boolean;
};

export type HandoffServicePort = {
  requestCustomerHandoff(input: RequestCustomerHandoffInput): Promise<RequestCustomerHandoffResult>;
};
