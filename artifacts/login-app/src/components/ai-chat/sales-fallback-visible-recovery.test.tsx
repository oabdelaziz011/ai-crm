/**
 * Component/integration test for the official floating assistant message list.
 * The fake gateway is injected at the tool-loop boundary. This does not open a browser
 * and does not call OpenAI.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DuplicateExternalMessageError } from "@workspace/ai-conversation";
import { ToolCallLoopService, type RuntimeGatewayPort } from "@workspace/ai-execution-engine";
import {
  assistantReplyExternalId,
  persistOutgoingOnce,
} from "@workspace/runtime-integration/factory/persist-outgoing-once";
import { AiChatMessageList } from "@/components/ai-chat/ai-chat-message-list";
import { resolveFloatingTurnIdempotencyKey } from "@/hooks/ai-chat/floating-turn-idempotency";
import {
  buildDisplayMessages,
  shouldClearStreamingBeforeRefresh,
} from "@/hooks/ai-chat/streaming-refresh-lifecycle";
import "@/i18n";

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

const CORRELATION_ID = "inbound-fallback-1";
const FALLBACK_TEXT = "A draft quote was saved. It was not sent.";

describe("floating assistant visible fallback recovery", () => {
  it("renders one persisted draft-quote fallback after a fake provider rate limit", async () => {
    let modelCalls = 0;
    let streamCalls = 0;
    const executed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        if (modelCalls === 1) {
          return {
            text: "",
            model: "fake-sales",
            providerKey: "fake",
            finishReason: "tool_calls",
            usage: { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
            latencyMs: 1,
            toolCalls: [{ id: "call-quote", name: "create_draft_quote", arguments: {} }],
          };
        }
        throw new Error("provider_rate_limit_exceeded");
      },
      async *streamChatCompletion() {
        streamCalls += 1;
        throw new Error("stream_must_not_run");
      },
    };
    const loop = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => ["create_draft_quote", "request_send_quote"],
        async route(_ctx, request) {
          executed.push(request.toolKey);
          if (request.toolKey === "request_send_quote") throw new Error("quote send must not run");
          return {
            toolKey: request.toolKey,
            executionId: "exec-quote",
            status: "succeeded",
            output: {
              success: true,
              quoteId: "quote-synthetic",
              draftOnly: true,
              sent: false,
            },
            durationMs: 1,
          };
        },
      },
    });

    const loopResult = await loop.runWithOptionalStreaming({
      ctx,
      conversationId: "conversation-synthetic",
      deferDeterministicSales: true,
      onStreamChunk: () => undefined,
      gatewayRequest: {
        messages: [{ role: "user", content: "Please prepare a quote" }],
        providerKey: "fake",
        model: "fake-sales",
        context: { companyId: "company-1", conversationId: "conversation-synthetic", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_draft_quote" } }],
      allowedToolKeys: ["create_draft_quote", "request_send_quote"],
    });

    assert.equal(modelCalls, 2);
    assert.equal(streamCalls, 0);
    assert.deepEqual(executed, ["create_draft_quote"]);
    assert.equal(loopResult.response.finishReason, "fallback");
    assert.equal(loopResult.response.text, FALLBACK_TEXT);
    assert.equal(loopResult.toolExecutions[0]?.output?.sent, false);

    const externalMessageId = assistantReplyExternalId(CORRELATION_ID);
    const stored = new Map<string, { id: string; content: string; externalMessageId: string }>();
    const persist = () =>
      persistOutgoingOnce({
        correlationId: CORRELATION_ID,
        insert: async (externalId) => {
          if (!externalId) throw new Error("missing external id");
          const existing = stored.get(externalId);
          if (existing) throw new DuplicateExternalMessageError(externalId);
          const message = { id: "msg-fallback-1", content: loopResult.response.text, externalMessageId: externalId };
          stored.set(externalId, message);
          return message;
        },
        findExisting: async (externalId) => stored.get(externalId) ?? null,
      });

    const first = await persist();
    const retry = await persist();
    assert.equal(first.reused, false);
    assert.equal(retry.reused, true);
    assert.equal(retry.message.id, first.message.id);
    assert.equal(stored.size, 1);
    assert.equal(externalMessageId, "assistant-reply:inbound-fallback-1");

    const loaded = [
      { id: "in-1", role: "user" as const, content: "Please prepare a quote", createdAt: "t1" },
      {
        id: first.message.id,
        role: "assistant" as const,
        content: first.message.content,
        createdAt: "t2",
        externalMessageId,
      },
    ];
    const displayed = buildDisplayMessages({
      loaded,
      welcomeMessage: "Welcome",
      suppressSyntheticWelcome: true,
      pendingAssistantContent: first.message.content,
    });
    assert.equal(shouldClearStreamingBeforeRefresh({
      isSending: true,
      hasStreamingContent: true,
      hasRenderableAssistantResponse: true,
    }), true);
    assert.equal(displayed.filter((message) => message.role === "assistant").length, 1);

    const html = renderToStaticMarkup(
      createElement(AiChatMessageList, {
        messages: displayed,
        assistantName: "Local sales test",
        streamingContent: first.message.content,
        isSending: false,
      }),
    );
    const visibleReplies = html.split(`data-external-message-id="${externalMessageId}"`).length - 1;
    assert.equal(visibleReplies, 1);
    assert.equal(html.split(`data-message-id="${first.message.id}"`).length - 1, 1);
    assert.equal(html.includes(FALLBACK_TEXT), true);
    assert.equal(html.includes("provider_rate_limit_exceeded"), false);
    assert.equal(html.split(FALLBACK_TEXT).length - 1, 1);

    const reloadedKey = resolveFloatingTurnIdempotencyKey({
      conversationId: "conversation-synthetic",
      text: "Please prepare a quote",
      previousFailedTurn: null,
      createKey: () => "floating:conversation-synthetic:reloaded",
    });
    assert.notEqual(reloadedKey, `floating:conversation-synthetic:${CORRELATION_ID}`);
    assert.equal(stored.size, 1);
  });
});
