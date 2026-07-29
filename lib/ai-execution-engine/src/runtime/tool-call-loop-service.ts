import type { ChatToolCall } from "@workspace/ai-provider-layer";
import type { RuntimeGatewayPort, RuntimeGatewayChatRequest, RuntimeGatewayChatResponse } from "../ports/runtime-ports.js";
import type { RuntimeToolPort } from "../ports/runtime-ports.js";
import type { ServiceContext } from "../types.js";

const MAX_TOOL_ITERATIONS = 3;

export type ToolCallLoopInput = {
  ctx: ServiceContext;
  conversationId: string;
  gatewayRequest: RuntimeGatewayChatRequest;
  tools: unknown[];
  allowedToolKeys: string[];
};

export type ToolCallLoopResult = {
  response: RuntimeGatewayChatResponse;
  messages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: Array<{
    toolKey: string;
    executionId: string;
    status: string;
    output: Record<string, unknown> | null;
    durationMs: number;
  }>;
};

export class ToolCallLoopService {
  constructor(
    private readonly deps: {
      gateway: RuntimeGatewayPort;
      tools?: RuntimeToolPort;
    },
  ) {}

  async run(input: ToolCallLoopInput): Promise<ToolCallLoopResult> {
    if (!this.deps.tools || input.tools.length === 0) {
      const response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        tools: undefined,
      });
      return { response, messages: [...input.gatewayRequest.messages], toolExecutions: [] };
    }

    const messages = [...input.gatewayRequest.messages];
    const toolExecutions: ToolCallLoopResult["toolExecutions"] = [];
    let response: RuntimeGatewayChatResponse | null = null;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        messages,
        tools: input.tools,
      });

      const toolCalls = response.toolCalls ?? [];
      if (toolCalls.length === 0) {
        break;
      }

      messages.push({
        role: "assistant",
        content: response.text || "",
        toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (!input.allowedToolKeys.includes(toolCall.name)) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              errorCode: "TOOL_NOT_ALLOWED",
              message: `Tool ${toolCall.name} is not enabled.`,
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const routed = await this.deps.tools.route(input.ctx, {
          conversationId: input.conversationId,
          toolKey: toolCall.name,
          input: toolCall.arguments,
          triggeredBy: "llm",
        });

        toolExecutions.push({
          toolKey: routed.toolKey,
          executionId: routed.executionId,
          status: routed.status,
          output: routed.output,
          durationMs: routed.durationMs,
        });

        const toolPayload =
          routed.status === "succeeded" && routed.output
            ? routed.output
            : {
                success: false,
                errorCode: routed.errorCode ?? "TOOL_FAILED",
                message: routed.errorMessage ?? "Tool execution failed.",
              };

        messages.push({
          role: "tool",
          content: JSON.stringify(toolPayload),
          toolCallId: toolCall.id,
        });
      }
    }

    if (!response) {
      throw new Error("Tool call loop did not produce a gateway response.");
    }

    if (!response.text.trim() && toolExecutions.length > 0) {
      response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        messages,
        tools: undefined,
      });
    }

    return { response, messages, toolExecutions };
  }

  async runWithOptionalStreaming(
    input: ToolCallLoopInput & { onStreamChunk?: (chunk: string) => void },
  ): Promise<ToolCallLoopResult> {
    const loopResult = await this.run(input);

    if (
      !input.onStreamChunk ||
      !this.deps.gateway.streamChatCompletion ||
      input.tools.length === 0
    ) {
      return loopResult;
    }

    if (loopResult.toolExecutions.length === 0) {
      if (loopResult.response.text) {
        input.onStreamChunk(loopResult.response.text);
      }
      return loopResult;
    }

    if (loopResult.response.text.trim()) {
      input.onStreamChunk(loopResult.response.text);
      return loopResult;
    }

    let streamedText = "";
    for await (const event of this.deps.gateway.streamChatCompletion({
      ...input.gatewayRequest,
      messages: loopResult.messages,
      tools: undefined,
    })) {
      if (event.type === "delta" && event.delta) {
        streamedText += event.delta;
        input.onStreamChunk(event.delta);
      }
    }

    if (streamedText.trim()) {
      loopResult.response = { ...loopResult.response, text: streamedText };
    }

    return loopResult;
  }
}

export function mapGatewayToolCalls(toolCalls?: ChatToolCall[]) {
  return toolCalls?.map((call) => ({
    id: call.id,
    name: call.name,
    arguments: call.arguments,
  }));
}
