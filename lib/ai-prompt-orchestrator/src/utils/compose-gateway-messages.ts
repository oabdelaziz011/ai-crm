import type { GatewayChatMessage, PromptMessagePlan } from "../types.js";

export function composeGatewayMessages(plan: PromptMessagePlan): GatewayChatMessage[] {
  const messages: GatewayChatMessage[] = [];

  if (plan.systemContent.trim()) {
    messages.push({ role: "system", content: plan.systemContent.trim() });
  }

  if (plan.developerContent?.trim()) {
    messages.push({ role: "developer", content: plan.developerContent.trim() });
  }

  for (const turn of plan.history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  if (plan.userMessage.trim()) {
    messages.push({ role: "user", content: plan.userMessage.trim() });
  }

  return messages;
}

export function serializeGatewayMessages(messages: GatewayChatMessage[]): string {
  return JSON.stringify(messages);
}
