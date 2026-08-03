import type { EscalationTrigger } from "@workspace/human-handoff-platform";

export type HandoffAgentToolPorts = {
  escalateToHuman(input: {
    companyId: string;
    conversationId: string;
    triggerCode: EscalationTrigger;
    reason: string;
    targetQueueId?: string;
    aiAssistantId?: string;
  }): Promise<{ ownership: { ownerType: string; ownerLabel: string }; requestId: string }>;

  queueForHuman(input: {
    companyId: string;
    conversationId: string;
    queueId: string;
    reason: string;
    aiAssistantId?: string;
  }): Promise<{ queuePosition: number; estimatedWaitSeconds: number }>;

  returnToAi(input: {
    companyId: string;
    conversationId: string;
    reason: string;
  }): Promise<{ ownership: { ownerType: string } }>;
};
