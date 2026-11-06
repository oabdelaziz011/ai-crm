/**
 * Integration coverage for the floating assistant send boundary.
 * The fake gateway is the production RuntimeGatewayPort injected into ToolCallLoopService.
 * The message list is the component FloatingAiPanelContent renders.
 * This does not open a browser and does not call OpenAI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCallLoopService, type RuntimeGatewayPort } from "@workspace/ai-execution-engine";
import {
  assistantReplyExternalId,
  persistOutgoingOnce,
} from "@workspace/runtime-integration/factory/persist-outgoing-once";
import { AiChatMessageList } from "@/components/ai-chat/ai-chat-message-list";
import type { ChatMessage } from "@/hooks/ai-chat/use-ai-chat-workspace";
import {
  isSafeCustomerDetail,
  resolveFloatingSendErrorMessage,
  toCustomerFacingSendError,
} from "@/hooks/ai-chat/customer-facing-send-error";
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

type Stored = { id: string; content: string; externalMessageId: string };

function renderList(input: {
  messages: ChatMessage[];
  isSending: boolean;
  streamingContent?: string;
}) {
  return renderToStaticMarkup(
    createElement(AiChatMessageList, {
      messages: input.messages,
      assistantName: "Local sales test",
      streamingContent: input.streamingContent,
      isSending: input.isSending,
    }),
  );
}

function assistantCount(html: string) {
  return html.split('data-message-role="assistant"').length - 1;
}

describe("floating assistant send acceptance", () => {
  it("renders one successful reply and a separate reply for a new turn", async () => {
    const stored = new Map<string, Stored>();
    let calls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        calls += 1;
        return {
          text: calls === 1 ? "Thanks, I can help with that." : "Here is the next answer.",
          model: "fake-sales",
          providerKey: "fake",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools: { allowedToolKeys: () => [], listLlmTools: () => [], async route() { throw new Error("no tools"); } } });
    const run = (text: string) =>
      loop.run({
        ctx,
        conversationId: "conversation-synthetic",
        gatewayRequest: {
          messages: [{ role: "user", content: text }],
          providerKey: "fake",
          model: "fake-sales",
          context: { companyId: "company-1", conversationId: "conversation-synthetic", userId: "user-1" },
        },
        tools: [],
        allowedToolKeys: [],
      });

    const first = await run("Hello from the acceptance test");
    const second = await run("A different question");
    assert.equal(calls, 2);
    assert.equal(first.response.text, "Thanks, I can help with that.");
    assert.equal(second.response.text, "Here is the next answer.");

    const save = async (correlationId: string, content: string, id: string) =>
      persistOutgoingOnce({
        correlationId,
        insert: async (externalId) => {
          if (!externalId) throw new Error("missing external id");
          const message = { id, content, externalMessageId: externalId };
          stored.set(externalId, message);
          return message;
        },
        findExisting: async (externalId) => stored.get(externalId) ?? null,
      });
    const savedFirst = await save("turn-a", first.response.text, "msg-a");
    const savedSecond = await save("turn-b", second.response.text, "msg-b");
    assert.equal(savedFirst.reused, false);
    assert.equal(savedSecond.reused, false);
    assert.notEqual(assistantReplyExternalId("turn-a"), assistantReplyExternalId("turn-b"));

    const html = renderList({
      isSending: false,
      messages: [
        { id: "in-a", role: "user", content: "Hello from the acceptance test", createdAt: "t1" },
        { id: "msg-a", role: "assistant", content: savedFirst.message.content, createdAt: "t2", externalMessageId: assistantReplyExternalId("turn-a") },
        { id: "in-b", role: "user", content: "A different question", createdAt: "t3" },
        { id: "msg-b", role: "assistant", content: savedSecond.message.content, createdAt: "t4", externalMessageId: assistantReplyExternalId("turn-b") },
      ],
    });
    assert.equal(assistantCount(html), 2);
    assert.equal(html.split('data-external-message-id="assistant-reply:turn-a"').length - 1, 1);
    assert.equal(html.split('data-external-message-id="assistant-reply:turn-b"').length - 1, 1);
    assert.equal(html.includes("provider_rate_limit_exceeded"), false);
  });

  it("shows one draft fallback, hides provider text, and does not duplicate the same turn", async () => {
    let modelCalls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        if (modelCalls === 1) {
          return {
            text: "",
            model: "fake-sales",
            providerKey: "fake",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [{ id: "call-quote", name: "create_draft_quote", arguments: {} }],
          };
        }
        throw new Error("provider_rate_limit_exceeded");
      },
      async *streamChatCompletion() {
        throw new Error("stream_must_not_run");
      },
    };
    const loop = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => ["create_draft_quote"],
        listLlmTools: () => [],
        async route() {
          return {
            toolKey: "create_draft_quote",
            executionId: "exec-quote",
            status: "succeeded",
            output: { success: true, quoteId: "quote-synthetic", draftOnly: true, sent: false },
            durationMs: 1,
            errorCode: null,
            errorMessage: null,
          };
        },
      },
    });
    const result = await loop.runWithOptionalStreaming({
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
      allowedToolKeys: ["create_draft_quote"],
    });
    const fallback = "A draft quote was saved. It was not sent.";
    assert.equal(modelCalls, 2);
    assert.equal(result.response.text, fallback);
    assert.equal(result.response.finishReason, "fallback");

    const stored = new Map<string, Stored>();
    const persist = () =>
      persistOutgoingOnce({
        correlationId: "inbound-fallback-1",
        insert: async (externalId) => {
          if (!externalId) throw new Error("missing external id");
          if (stored.has(externalId)) {
            const error = new Error("duplicate");
            (error as { code?: string }).code = "23505";
            throw error;
          }
          const message = { id: "msg-fallback-1", content: result.response.text, externalMessageId: externalId };
          stored.set(externalId, message);
          return message;
        },
        findExisting: async (externalId) => stored.get(externalId) ?? null,
      });
    const first = await persist();
    const retry = await persist();
    assert.equal(retry.reused, true);
    assert.equal(retry.message.id, "msg-fallback-1");
    assert.equal(stored.size, 1);

    const displayed = buildDisplayMessages({
      loaded: [
        { id: "in-1", role: "user", content: "Please prepare a quote", createdAt: "t1" },
        { id: "msg-fallback-1", role: "assistant", content: fallback, createdAt: "t2", externalMessageId: "assistant-reply:inbound-fallback-1" },
      ],
      welcomeMessage: "Welcome",
      suppressSyntheticWelcome: true,
      pendingAssistantContent: fallback,
    });
    assert.equal(shouldClearStreamingBeforeRefresh({
      isSending: true,
      hasStreamingContent: true,
      hasRenderableAssistantResponse: true,
    }), true);
    const sending = renderList({
      isSending: true,
      streamingContent: fallback,
      messages: [{ id: "in-1", role: "user", content: "Please prepare a quote", createdAt: "t1" }],
    });
    const settled = renderList({
      isSending: false,
      streamingContent: fallback,
      messages: displayed,
    });
    assert.equal(sending.includes("animate-pulse") || sending.includes(fallback), true);
    assert.equal(settled.includes("animate-pulse"), false);
    assert.equal(assistantCount(settled), 1);
    assert.equal(settled.split('data-external-message-id="assistant-reply:inbound-fallback-1"').length - 1, 1);
    assert.equal(settled.includes("provider_rate_limit_exceeded"), false);
    assert.equal(settled.split(fallback).length - 1, 1);

    const reloaded = resolveFloatingTurnIdempotencyKey({
      conversationId: "conversation-synthetic",
      text: "Please prepare a quote",
      previousFailedTurn: null,
      createKey: () => "floating:conversation-synthetic:new",
    });
    assert.equal(reloaded, "floating:conversation-synthetic:new");
    assert.equal(stored.size, 1);
  });

  it("shows the persistence failure instead of a successful reply", async () => {
    let caught: unknown;
    try {
      await persistOutgoingOnce({
        correlationId: "inbound-persist-fail",
        insert: async () => {
          throw new Error("provider_rate_limit_exceeded\n    at ToolCallLoopService.run (/src/runtime/tool-call-loop-service.ts:1)");
        },
        findExisting: async () => null,
      });
    } catch (error) {
      caught = error;
    }
    const shown = toCustomerFacingSendError(caught);
    assert.equal(shown, "The assistant reply could not be saved.");
    const copy = {
      channelRouteFailed: "The message could not be delivered to the AI runtime.",
      runtimeFailed: (detail: string) => `The assistant could not complete your request. ${detail}`,
    };
    assert.equal(resolveFloatingSendErrorMessage(shown, copy), `${copy.runtimeFailed(shown)}`);
    const providerShown = resolveFloatingSendErrorMessage("provider_rate_limit_exceeded", copy);
    assert.equal(providerShown, copy.channelRouteFailed);
    assert.equal(providerShown?.includes("provider_rate_limit_exceeded"), false);
    const stackShown = resolveFloatingSendErrorMessage(
      "Error: quota\n    at ToolCallLoopService.run (/src/runtime/tool-call-loop-service.ts:1)",
      copy,
    );
    assert.equal(stackShown, copy.channelRouteFailed);
    assert.equal(isSafeCustomerDetail("You exceeded your current quota. Please retry."), false);
    assert.equal(toCustomerFacingSendError(new Error("provider_rate_limit_exceeded")), "channel_route_failed");
    const html = renderList({
      isSending: false,
      messages: [{ id: "in-1", role: "user", content: "Please prepare a quote", createdAt: "t1" }],
    });
    assert.equal(assistantCount(html), 0);
    assert.equal(html.includes("A draft quote was saved"), false);
    assert.equal(html.includes("provider_rate_limit_exceeded"), false);
    assert.equal(html.includes(shown), false);
  });

  it("keeps the public website chat allowlist closed", () => {
    const source = readFileSync(
      new URL(
        "../../../../api-server/src/services/public-web-chat/public-web-chat-tool-policy.ts",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      source,
      /export const PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS = Object\.freeze\(\[\r?\n {2}"knowledge_search",\r?\n {2}"search_availability",\r?\n {2}"find_next_available",\r?\n {2}"recommend_appointment",\r?\n {2}"escalate_to_human",\r?\n {2}"queue_handoff",\r?\n\] as const\);/,
    );
  });
});
