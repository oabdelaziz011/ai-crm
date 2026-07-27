import type { RuntimeGatewayChatRequest } from "../ports/runtime-ports.js";
import { createAIRuntimeLogEvent, logAIRuntimeEvent } from "./ai-runtime-logger.js";

function summarizeTools(tools: unknown[] | undefined): Array<{ name?: string; type?: string }> {
  if (!tools?.length) return [];
  return tools.map((tool) => {
    if (typeof tool !== "object" || tool === null) return {};
    const record = tool as Record<string, unknown>;
    const fn =
      typeof record.function === "object" && record.function !== null
        ? (record.function as Record<string, unknown>)
        : null;
    return {
      name: typeof fn?.name === "string" ? fn.name : typeof record.name === "string" ? record.name : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
    };
  });
}

export function logOpenAIRequest(input: {
  correlationId?: string;
  companyId?: string;
  conversationId?: string;
  executionId?: string;
  sessionId?: string;
  providerKey?: string;
  model?: string;
  promptBuildId?: string | null;
  request: RuntimeGatewayChatRequest;
  responseFormat?: "text" | "json";
}): void {
  logAIRuntimeEvent(
    createAIRuntimeLogEvent("ai_runtime_openai_request", {
      correlationId: input.correlationId,
      companyId: input.companyId,
      conversationId: input.conversationId,
      executionId: input.executionId,
      sessionId: input.sessionId,
      providerKey: input.providerKey,
      model: input.model,
      promptBuildId: input.promptBuildId,
      messages: JSON.stringify(input.request.messages),
      tools: JSON.stringify(summarizeTools(input.request.tools as unknown[] | undefined)),
      responseFormat: input.responseFormat ?? "text",
    }),
  );
}
