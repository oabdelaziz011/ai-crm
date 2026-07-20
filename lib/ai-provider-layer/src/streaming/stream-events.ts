export type AIStreamEventType = "start" | "delta" | "usage" | "done" | "error";

export type AIStreamEvent = {
  type: AIStreamEventType;
  providerKey: string;
  model?: string;
  delta?: string;
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  errorMessage?: string;
  timestamp: string;
};

export function createStreamEvent(
  type: AIStreamEventType,
  providerKey: string,
  patch?: Partial<Omit<AIStreamEvent, "type" | "providerKey" | "timestamp">>,
): AIStreamEvent {
  return {
    type,
    providerKey,
    timestamp: new Date().toISOString(),
    ...patch,
  };
}
