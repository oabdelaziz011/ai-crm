import { createContext, useContext, type ReactNode } from "react";
import type { ChatMessage } from "@/hooks/ai-chat/use-ai-chat-workspace";
import type { RuntimeChatExecutionConfig } from "@/lib/runtime-integration/chat-config";

/**
 * Test-only seam for the floating assistant.
 * Production never mounts this provider, so the hook keeps the real workspace.
 * It is not an environment switch and cannot be enabled by user input.
 */
export type FloatingAiChatOverride = Partial<{
  assistantName: string;
  displayMessages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  sendError: string | null;
  sendMessage: (text: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  streamingContent: string;
  runtimeConfig: RuntimeChatExecutionConfig | null;
}>;

const FloatingAiRuntimeOverrideContext = createContext<FloatingAiChatOverride | null>(null);

export function FloatingAiRuntimeOverrideProvider({
  value,
  children,
}: {
  value: FloatingAiChatOverride;
  children: ReactNode;
}) {
  return (
    <FloatingAiRuntimeOverrideContext.Provider value={value}>
      {children}
    </FloatingAiRuntimeOverrideContext.Provider>
  );
}

export function useFloatingAiRuntimeOverride(): FloatingAiChatOverride | null {
  return useContext(FloatingAiRuntimeOverrideContext);
}
