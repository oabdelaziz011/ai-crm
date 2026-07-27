import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeGatewayMessages } from "./compose-gateway-messages.js";
import { composeMessagePlan, resolveUserTurn } from "./compose-message-plan.js";

describe("composeMessagePlan", () => {
  it("separates system, developer tool rules, history, and current user message in conversation mode", () => {
    const plan = composeMessagePlan({
      mode: "conversation",
      toolsEnabled: true,
      outputContract: {
        format: "json",
        instructions: "Return JSON with reply.",
      },
      currentUserMessage: "Hello",
      recentMessages: [
        { role: "customer", content: "Hi there" },
        { role: "assistant", content: "Welcome!" },
        { role: "customer", content: "Hello" },
      ],
      sections: [
        { key: "system_instructions", title: "System Instructions", content: "You are Acme Assistant." },
        { key: "safety_instructions", title: "Safety Instructions", content: "Stay safe." },
        { key: "intent_decision", title: "Intent Decision", content: "Intent: greeting" },
        { key: "recent_messages", title: "Recent Messages", content: "CUSTOMER: Hello" },
        { key: "output_contract", title: "Output Contract", content: "Return JSON." },
      ],
    });

    assert.equal(plan.mode, "conversation");
    assert.equal(plan.outputContract.format, "text");
    assert.match(plan.systemContent, /Acme Assistant/);
    assert.match(plan.developerContent ?? "", /call tools/i);
    assert.equal(plan.userMessage, "Hello");
    assert.deepEqual(plan.history, [
      { role: "user", content: "Hi there" },
      { role: "assistant", content: "Welcome!" },
    ]);

    const messages = composeGatewayMessages(plan);
    assert.deepEqual(
      messages.map((message) => message.role),
      ["system", "developer", "user", "assistant", "user"],
    );
    assert.equal(messages.at(-1)?.content, "Hello");
  });

  it("includes output contract only in execution mode", () => {
    const plan = composeMessagePlan({
      mode: "execution",
      toolsEnabled: true,
      outputContract: {
        format: "json",
        instructions: "Return JSON with reply, confidence, requires_human.",
      },
      currentUserMessage: "Extract fields",
      sections: [
        { key: "system_instructions", title: "System Instructions", content: "Extract data." },
        { key: "output_contract", title: "Output Contract", content: "Return structured JSON." },
      ],
    });

    assert.equal(plan.outputContract.format, "json");
    assert.match(plan.developerContent ?? "", /structured JSON/i);

    const messages = composeGatewayMessages(plan);
    assert.equal(messages.at(-1)?.role, "user");
    assert.equal(messages.at(-1)?.content, "Extract fields");
  });
});

describe("resolveUserTurn", () => {
  it("uses only the latest customer message as the user turn", () => {
    const resolved = resolveUserTurn({
      recentMessages: [
        { role: "customer", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
        { role: "customer", content: "Follow up" },
      ],
    });

    assert.equal(resolved.userMessage, "Follow up");
    assert.deepEqual(resolved.history, [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    ]);
  });
});
