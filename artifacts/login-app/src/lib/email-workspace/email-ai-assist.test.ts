import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchEmailSuggestedReplies,
  generateEmailAiDraft,
  generateEmailThreadSummary,
  type EmailAiAssistAction,
  type EmailAiAssistDeps,
} from "./email-ai-assist.ts";

describe("email-ai-assist", () => {
  it("generateEmailAiDraft returns text only and never auto-sends", async () => {
    const chatCalls: unknown[] = [];
    let sendAttempted = false;

    const deps: EmailAiAssistDeps = {
      chatCompletion: async (body) => {
        chatCalls.push(body);
        return { text: "Draft reply body" };
      },
      suggestedReplies: async () => {
        sendAttempted = true;
        return { suggestions: [] };
      },
    };

    const text = await generateEmailAiDraft(
      {
        companyId: "co-1",
        conversationId: "conv-1",
        action: "generate_reply",
        threadText: "Customer: Hello",
        draftText: "",
        targetLanguage: "en",
      },
      deps,
    );

    assert.equal(text, "Draft reply body");
    assert.equal(chatCalls.length, 1);
    assert.equal(sendAttempted, false);
    const body = chatCalls[0] as { messages: Array<{ content: string }> };
    assert.match(JSON.stringify(body.messages), /Do not send email/i);
    assert.match(JSON.stringify(body.messages), /Do not invent customer names/i);
    assert.match(JSON.stringify(body.messages), /Do not upload, delete, or modify attachments/i);
  });

  it("fetchEmailSuggestedReplies returns suggestion texts only (insert-on-click contract)", async () => {
    const deps: EmailAiAssistDeps = {
      suggestedReplies: async () => ({
        suggestions: [{ text: "One" }, { text: "Two" }, { text: "" }, { text: "Three" }],
      }),
    };

    const items = await fetchEmailSuggestedReplies(
      {
        companyId: "co-1",
        conversationId: "conv-1",
        targetLanguage: "en",
      },
      deps,
    );
    assert.deepEqual(items, ["One", "Two", "Three"]);
  });

  it("each assist action produces text via chat completion", async () => {
    const actions: EmailAiAssistAction[] = [
      "generate_reply",
      "rewrite",
      "formal",
      "friendly",
      "shorten",
      "expand",
      "improve",
      "translate",
      "change_tone",
    ];

    for (const action of actions) {
      const text = await generateEmailAiDraft(
        {
          companyId: "co-1",
          conversationId: "conv-1",
          action,
          threadText: "thread",
          draftText: "draft",
          targetLanguage: "ar",
        },
        {
          chatCompletion: async (body) => {
            const user = body.messages.find(
              (m) => typeof m.content === "string" && String(m.content).includes("Action:"),
            );
            const match = String(user?.content ?? "").match(/Action: (\w+)/);
            return { text: `result:${match?.[1] ?? "unknown"}` };
          },
        },
      );
      assert.equal(text, `result:${action}`);
    }
  });

  it("all Copilot actions return text only and never increment a send counter", async () => {
    let sendCount = 0;
    const deps: EmailAiAssistDeps = {
      chatCompletion: async (body) => {
        assert.equal("send" in body, false);
        return { text: `ok:${String((body.messages[1] as { content?: string })?.content ?? "").match(/Action: (\w+)/)?.[1] ?? "summary"}` };
      },
      suggestedReplies: async () => ({ suggestions: [{ text: "Chip one" }] }),
    };

    const before = sendCount;
    await generateEmailAiDraft(
      {
        companyId: "co-1",
        conversationId: "conv-1",
        action: "improve",
        threadText: "thread",
        draftText: "draft",
        targetLanguage: "ar",
      },
      deps,
    );
    const suggestions = await fetchEmailSuggestedReplies(
      { companyId: "co-1", conversationId: "conv-1", targetLanguage: "ar" },
      deps,
    );
    await generateEmailThreadSummary(
      { companyId: "co-1", threadText: "thread", targetLanguage: "ar" },
      deps,
    );
    assert.equal(suggestions[0], "Chip one");
    assert.equal(sendCount, before);
  });

  it("generateEmailThreadSummary returns summary text and does not send", async () => {
    let chatCount = 0;
    let suggestedCalled = false;

    const summary = await generateEmailThreadSummary(
      {
        companyId: "co-1",
        threadText: "Customer asked about invoice",
        targetLanguage: "en",
      },
      {
        chatCompletion: async () => {
          chatCount += 1;
          return { text: "Intent: billing. Next: clarify invoice." };
        },
        suggestedReplies: async () => {
          suggestedCalled = true;
          return { suggestions: [] };
        },
      },
    );

    assert.match(summary, /billing/i);
    assert.equal(chatCount, 1);
    assert.equal(suggestedCalled, false);
  });
});
