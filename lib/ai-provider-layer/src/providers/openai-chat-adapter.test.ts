import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpenAIChatAdapter } from "./openai-chat-adapter.js";

const MOCK_RESPONSE =
  "Enterprise MFA policy requires multi-factor authentication for all users.";

function createMockChatFetch(options?: { stream?: boolean }) {
  return async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean; messages?: unknown[] };

    if (body.stream ?? options?.stream) {
      const chunks = MOCK_RESPONSE.split(" ");
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  model: "gpt-4o-mini",
                  choices: [{ delta: { content: `${chunk} ` } }],
                })}\n\n`,
              ),
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                model: "gpt-4o-mini",
                usage: { prompt_tokens: 42, completion_tokens: 18, total_tokens: 60 },
                choices: [{ finish_reason: "stop" }],
              })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return { ok: true, status: 200, body: stream, json: async () => ({}) } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: "gpt-4o-mini",
        choices: [{ message: { role: "assistant", content: MOCK_RESPONSE }, finish_reason: "stop" }],
        usage: { prompt_tokens: 42, completion_tokens: 18, total_tokens: 60 },
      }),
    } as Response;
  };
}

describe("OpenAIChatAdapter", () => {
  it("generates a non-streaming chat completion with token usage", async () => {
    const adapter = createOpenAIChatAdapter(
      { model: "gpt-4o-mini", apiKey: "test-key" },
      { fetchFn: createMockChatFetch() },
    );

    const result = await adapter.generate({
      prompt: "System: You are helpful.\nUser: What is MFA?",
      metadata: { streaming: false, max_tokens: 128 },
    });

    assert.equal(result.mock, false);
    assert.match(result.text, /MFA policy/i);
    assert.equal(result.tokenUsage?.total_tokens, 60);
    assert.equal(result.finishReason, "stop");
  });

  it("streams chunks and returns accumulated text", async () => {
    const chunks: string[] = [];
    const adapter = createOpenAIChatAdapter(
      { model: "gpt-4o-mini", apiKey: "test-key" },
      { fetchFn: createMockChatFetch({ stream: true }) },
    );

    const result = await adapter.generate({
      prompt: "User: Explain MFA",
      metadata: {
        streaming: true,
        onChunk: (chunk) => chunks.push(chunk),
      },
    });

    assert.ok(chunks.length > 0);
    assert.match(result.text, /Enterprise MFA policy/i);
    assert.equal(result.tokenUsage?.total_tokens, 60);
  });

  it("parses system and user sections from orchestrator prompt format", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fetchFn = async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return createMockChatFetch()(_url, init);
    };

    const adapter = createOpenAIChatAdapter(
      { model: "gpt-4o-mini", apiKey: "test-key" },
      { fetchFn },
    );

    await adapter.generate({
      prompt: "System: Use retrieved context.\nUser: What is the security policy?",
    });

    const messages = capturedBody?.messages as Array<{ role: string; content: string }>;
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
    assert.match(messages[1]?.content ?? "", /security policy/i);
  });
});
