import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeGatewayMessages, composeMessagePlan } from "@workspace/ai-prompt-orchestrator";

describe("AI Chat gateway message architecture", () => {
  it("sends Hello as an isolated user turn with system and developer roles separated", () => {
    const plan = composeMessagePlan({
      mode: "conversation",
      toolsEnabled: true,
      outputContract: { format: "json", instructions: "Return JSON." },
      currentUserMessage: "Hello",
      sections: [
        { key: "system_instructions", title: "System Instructions", content: "You are Vault Assistant." },
        { key: "assistant_profile", title: "Assistant Profile", content: "Assistant Name: Vault Assistant" },
        { key: "safety_instructions", title: "Safety Instructions", content: "Stay professional." },
      ],
    });

    const messages = composeGatewayMessages(plan);
    assert.equal(messages[0]?.role, "system");
    assert.match(messages[0]?.content ?? "", /Vault Assistant/);
    assert.equal(messages[1]?.role, "developer");
    assert.equal(messages.at(-1)?.role, "user");
    assert.equal(messages.at(-1)?.content, "Hello");
    assert.equal(messages.filter((message) => message.role === "user").length, 1);
  });

  it("keeps create-customer requests on the user turn while exposing tool rules to developer", () => {
    const plan = composeMessagePlan({
      mode: "conversation",
      toolsEnabled: true,
      outputContract: { format: "json", instructions: "Return JSON." },
      currentUserMessage: "Create a customer named Ahmed",
      sections: [
        { key: "system_instructions", title: "System Instructions", content: "You are Vault Assistant." },
        { key: "safety_instructions", title: "Safety Instructions", content: "Stay professional." },
      ],
    });

    const messages = composeGatewayMessages(plan);
    assert.match(messages.find((message) => message.role === "developer")?.content ?? "", /call tools/i);
    assert.equal(messages.at(-1)?.content, "Create a customer named Ahmed");
    assert.equal(
      messages.some((message) => message.content.includes("structured response contract")),
      false,
    );
  });
});
