import type { AIStreamEvent } from "@workspace/ai-provider-layer";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";

export type RuntimeStreamEvent =
  | { type: "start"; executionId: string }
  | { type: "delta"; executionId: string; text: string }
  | { type: "done"; executionId: string; text: string; latencyMs: number };

export class StreamingRuntimeService {
  async *stream(
    executionId: string,
    gateway: RuntimeGatewayPort,
    request: Parameters<RuntimeGatewayPort["chatCompletion"]>[0],
    onEvent?: (event: RuntimeStreamEvent) => void,
  ): AsyncIterable<RuntimeStreamEvent> {
    const started = Date.now();
    yield { type: "start", executionId };
    onEvent?.({ type: "start", executionId });

    if (!gateway.streamChatCompletion) {
      const response = await gateway.chatCompletion(request);
      yield { type: "delta", executionId, text: response.text };
      onEvent?.({ type: "delta", executionId, text: response.text });
      const done = { type: "done" as const, executionId, text: response.text, latencyMs: Date.now() - started };
      yield done;
      onEvent?.(done);
      return;
    }

    let text = "";
    for await (const event of gateway.streamChatCompletion(request)) {
      if (event.type === "delta" && event.delta) {
        text += event.delta;
        const delta = { type: "delta" as const, executionId, text: event.delta };
        yield delta;
        onEvent?.(delta);
      }
      if (event.type === "done") {
        const done = {
          type: "done" as const,
          executionId,
          text,
          latencyMs: Date.now() - started,
        };
        yield done;
        onEvent?.(done);
      }
      void (event as AIStreamEvent);
    }
  }
}
