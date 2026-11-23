import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGeminiChatAdapter } from "./gemini-chat-adapter.js";

describe("GeminiChatAdapter", () => {
  it("maps tools and returns text + tool calls from generateContent", async () => {
    const adapter = createGeminiChatAdapter(
      { model: "gemini-2.5-flash", apiKey: "test-key" },
      {
        fetchFn: async (url, init) => {
          assert.match(String(url), /gemini-2\.5-flash:generateContent/);
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            tools?: Array<{ functionDeclarations?: Array<{ name: string }> }>;
          };
          assert.equal(body.tools?.[0]?.functionDeclarations?.[0]?.name, "search_availability");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      { text: "Checking availability." },
                      { functionCall: { name: "search_availability", args: { serviceId: "svc-1" } } },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15,
              },
            }),
          } as Response;
        },
      },
    );

    const result = await adapter.generate({
      prompt: "System: You are helpful.\nUser: When is the next slot?",
      metadata: {
        tools: [
          {
            type: "function",
            function: {
              name: "search_availability",
              description: "Find slots",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      },
    });

    assert.equal(result.providerKey, "gemini");
    assert.equal(result.model, "gemini-2.5-flash");
    assert.match(result.text, /Checking availability/);
    assert.equal(result.toolCalls?.[0]?.name, "search_availability");
    assert.equal(result.tokenUsage?.total_tokens, 15);
  });

  it("prefers explicit request model over configuration default", async () => {
    let requestedUrl = "";
    const adapter = createGeminiChatAdapter(
      { model: "gemini-1.5-flash", apiKey: "test-key" },
      {
        fetchFn: async (url) => {
          requestedUrl = String(url);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
            }),
          } as Response;
        },
      },
    );

    await adapter.generate({ prompt: "User: hi", model: "gemini-2.5-flash" });
    assert.match(requestedUrl, /models\/gemini-2\.5-flash:generateContent/);
  });
});
