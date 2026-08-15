import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractAutomationOutboundMessages,
  extractAutomationResponseContent,
} from "./extract-automation-outbound.js";

describe("extractAutomationOutboundMessages", () => {
  it("returns all queued outbound messages in order", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "waiting_input",
      variables: {
        __outboundQueue: [
          { kind: "text", text: "Welcome" },
          { kind: "buttons", text: "Choose", buttons: [{ id: "a", label: "A" }] },
        ],
      },
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.text, "Welcome");
    assert.equal(messages[1]?.text, "Choose");
    assert.equal(messages[1]?.payload?.kind, "buttons");
  });

  it("maps image queue entries to attachment dispatch payloads", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "completed",
      variables: {
        __outboundQueue: [{ kind: "image", url: "https://example.com/a.png", caption: "Logo" }],
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.attachments?.[0]?.url, "https://example.com/a.png");
    assert.equal(messages[0]?.text, "Logo");
  });

  it("falls back to legacy __outbound for backward compatibility", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "completed",
      variables: {
        __outbound: { kind: "text", text: "Legacy" },
      },
    });
    assert.deepEqual(messages.map((message) => message.text), ["Legacy"]);
  });

  it("does not replay stale __prompt after a later node fails", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "failed",
      variables: {
        __prompt: "كم عمرك؟",
        customer_age: "٤٤",
      },
    });
    assert.deepEqual(messages, []);
  });

  it("still sends __prompt while waiting for input", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "waiting_input",
      variables: {
        __prompt: "كم عمرك؟",
        __waitingFor: "customer_age",
      },
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.text, "كم عمرك؟");
  });

  it("appends __prompt after earlier queued send_message text while waiting", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "waiting_input",
      variables: {
        __outboundQueue: [{ kind: "text", text: "أهلاً بك 👋\nمرحبًا بكم في عيادتنا." }],
        __prompt: "اهلا بيك يا فندم اقدر اساعدك ازاي ؟",
        __waitingFor: "customer_intent",
      },
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.text, "أهلاً بك 👋\nمرحبًا بكم في عيادتنا.");
    assert.equal(messages[1]?.text, "اهلا بيك يا فندم اقدر اساعدك ازاي ؟");
    assert.equal(messages[1]?.payload?.kind, "automation_prompt");
  });

  it("does not duplicate __prompt when it matches the last queued text", () => {
    const messages = extractAutomationOutboundMessages({
      lifecycle: "waiting_input",
      variables: {
        __outboundQueue: [{ kind: "buttons", text: "اختر ما تحتاجه", buttons: [{ id: "a", label: "A" }] }],
        __prompt: "اختر ما تحتاجه",
        __waitingFor: "__interactiveSelection",
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.text, "اختر ما تحتاجه");
  });
});

describe("extractAutomationResponseContent", () => {
  it("returns the last queued message text", () => {
    const text = extractAutomationResponseContent({
      lifecycle: "waiting_input",
      variables: {
        __outboundQueue: [
          { kind: "text", text: "First" },
          { kind: "text", text: "Second" },
        ],
      },
    });
    assert.equal(text, "Second");
  });

  it("extracts button prompt text from legacy outbound", () => {
    const text = extractAutomationResponseContent({
      lifecycle: "waiting_input",
      variables: {
        __outbound: { kind: "buttons", text: "Choose an option" },
      },
    });
    assert.equal(text, "Choose an option");
  });
});
