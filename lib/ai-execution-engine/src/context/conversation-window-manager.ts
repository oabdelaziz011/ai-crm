export type ConversationMessage = {
  role: "customer" | "assistant" | "system";
  content: string;
  createdAt?: string;
};

export type ConversationWindowConfig = {
  maxMessages?: number;
  tokenBudget?: number;
};

export type ConversationWindowResult = {
  messages: ConversationMessage[];
  trimmedCount: number;
  estimatedTokens: number;
};

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class ConversationWindowManager {
  trim(messages: ConversationMessage[], config: ConversationWindowConfig = {}): ConversationWindowResult {
    const maxMessages = config.maxMessages ?? 20;
    const tokenBudget = config.tokenBudget ?? 4096;

    const chronological = [...messages].sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return a.createdAt.localeCompare(b.createdAt);
    });

    let window = chronological.slice(-maxMessages);
    let trimmedCount = Math.max(0, chronological.length - window.length);
    let estimatedTokens = window.reduce((total, message) => total + estimateTokens(message.content), 0);

    while (estimatedTokens > tokenBudget && window.length > 1) {
      window = window.slice(1);
      trimmedCount += 1;
      estimatedTokens = window.reduce((total, message) => total + estimateTokens(message.content), 0);
    }

    return { messages: window, trimmedCount, estimatedTokens };
  }
}
