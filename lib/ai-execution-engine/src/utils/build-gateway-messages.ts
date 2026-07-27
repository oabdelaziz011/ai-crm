import {
  composeGatewayMessages,
  type GatewayChatMessage,
  type PromptMessagePlan,
} from "@workspace/ai-prompt-orchestrator";

export type { GatewayChatMessage };

export function resolveGatewayMessages(input: {
  gatewayMessages?: GatewayChatMessage[];
  messagePlan?: PromptMessagePlan | null;
  finalPrompt?: string;
}): GatewayChatMessage[] {
  if (input.gatewayMessages?.length) {
    return input.gatewayMessages;
  }
  if (input.messagePlan) {
    return composeGatewayMessages(input.messagePlan);
  }
  if (input.finalPrompt?.trim()) {
    return [{ role: "user", content: input.finalPrompt.trim() }];
  }
  return [];
}

export function serializeGatewayMessages(messages: GatewayChatMessage[]): string {
  return JSON.stringify(messages);
}
