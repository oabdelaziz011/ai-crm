export type HandoffEscalationTrigger =
  | "customer_requested"
  | "sentiment_negative"
  | "complex_issue"
  | "policy_violation"
  | "repeated_failure"
  | "vip_customer"
  | "manual_override";

export type HandoffOwnershipModel = Readonly<{
  ownerType: string;
  ownerLabel?: string;
}>;

export type HandoffWritePort = {
  escalateToHuman(input: {
    tenantId: string;
    conversationId: string;
    triggerCode: HandoffEscalationTrigger;
    reason: string;
    targetQueueId?: string;
    aiAssistantId?: string;
    actorUserId: string;
  }): Promise<{ requestId: string; ownership: HandoffOwnershipModel }>;

  queueForHuman(input: {
    tenantId: string;
    conversationId: string;
    queueId: string;
    reason: string;
    aiAssistantId?: string;
    actorUserId: string;
  }): Promise<{ queuePosition: number; estimatedWaitSeconds: number }>;

  returnToAi(input: {
    tenantId: string;
    conversationId: string;
    reason: string;
    actorUserId: string;
  }): Promise<{ ownership: HandoffOwnershipModel }>;
};
