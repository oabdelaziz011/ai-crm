import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWelcomeMessagePromptAddon,
  applyPostWelcomeSystemPrompt,
  DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE,
  normalizeAiEmployeeWelcomeMessageForStorage,
  resolveAiEmployeeWelcomeMessage,
  resolvePersonalizedWelcomeMessage,
  stripWelcomePromptFromSystemPrompt,
} from "./resolve-ai-employee-welcome-message.js";

describe("resolveAiEmployeeWelcomeMessage", () => {
  it("returns the platform default when storage is empty", () => {
    assert.equal(resolveAiEmployeeWelcomeMessage(""), DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
    assert.equal(resolveAiEmployeeWelcomeMessage("   "), DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
    assert.equal(resolveAiEmployeeWelcomeMessage(null), DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
  });

  it("returns the trimmed custom message when configured", () => {
    const custom = "أهلاً يا عميل ValueOR 👋\nكيف يمكنني مساعدتك اليوم؟";
    assert.equal(resolveAiEmployeeWelcomeMessage(`  ${custom}  `), custom);
  });

  it("normalizes storage to max length", () => {
    const long = "أ".repeat(1200);
    assert.equal(normalizeAiEmployeeWelcomeMessageForStorage(long).length, 1000);
  });

  it("builds a first-contact prompt addon with the configured welcome", () => {
    const addon = buildWelcomeMessagePromptAddon("مرحبًا بك");
    assert.match(addon, /CRITICAL FIRST-CONTACT WELCOME RULES/);
    assert.match(addon, /مرحبًا بك/);
    assert.match(addon, /never repeat the welcome message/i);
  });

  it("known welcome uses trusted CRM name only", () => {
    const personalized = resolvePersonalizedWelcomeMessage({
      storedWelcome: "",
      trustedCustomerName: "عمر",
    });
    assert.equal(personalized.split("\n")[0], "أهلاً يا عمر 👋");
    assert.doesNotMatch(personalized, /WhatsApp|senderName/i);
  });

  it("customer-id scoped display name renders عمر عبدالعزيز welcome", () => {
    const stored =
      "أهلاً وسهلاً بك 👋\nأنا المساعد الذكي الخاص بعيادات النور، كيف يمكنني مساعدتك اليوم؟";
    const personalized = resolvePersonalizedWelcomeMessage({
      storedWelcome: stored,
      trustedCustomerName: "عمر عبدالعزيز",
    });
    assert.equal(personalized.split("\n")[0], "أهلاً يا عمر عبدالعزيز 👋");
    assert.match(personalized, /عيادات النور/);
    assert.doesNotMatch(personalized, /عمر مجدي/);
  });

  it("unknown welcome stays generic / configured", () => {
    const personalized = resolvePersonalizedWelcomeMessage({
      storedWelcome: "",
      trustedCustomerName: null,
    });
    assert.equal(personalized, DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
  });

  it("preserves custom AI Employee welcome for known customers", () => {
    const custom = "مرحبا بك في عيادة النور\nكيف نقدر نساعدك؟";
    const personalized = resolvePersonalizedWelcomeMessage({
      storedWelcome: custom,
      trustedCustomerName: "سارة",
    });
    assert.match(personalized, /^أهلاً يا سارة 👋/);
    assert.match(personalized, /عيادة النور/);
  });

  it("prompt addon forbids inventing customer names when unknown", () => {
    const addon = buildWelcomeMessagePromptAddon(DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
    assert.match(addon, /Do not invent or infer a customer name/i);
  });

  it("prompt addon constrains known CRM name branch", () => {
    const addon = buildWelcomeMessagePromptAddon("أهلاً يا عمر 👋", {
      trustedCustomerName: "عمر",
    });
    assert.match(addon, /trusted CRM customer name/i);
    assert.match(addon, /Never invent/i);
  });

  it("stripWelcomePromptFromSystemPrompt removes LLM welcome instructions", () => {
    const addon = buildWelcomeMessagePromptAddon("مرحبًا");
    const prompt = ["You are helpful.", addon, "CRITICAL BOOKING ACTION RULES:", "- Rule 1"].join("\n\n");
    const stripped = stripWelcomePromptFromSystemPrompt(prompt);
    assert.doesNotMatch(stripped, /CRITICAL FIRST-CONTACT WELCOME RULES/);
    assert.doesNotMatch(stripped, /Configured welcome message/);
    assert.match(stripped, /CRITICAL BOOKING ACTION RULES/);
    assert.match(stripped, /You are helpful/);
  });

  it("applyPostWelcomeSystemPrompt strips first-contact rules and adds anti-greet rules", () => {
    const addon = buildWelcomeMessagePromptAddon("مرحبًا");
    const prompt = ["You are helpful.", addon, "CRITICAL BOOKING ACTION RULES:", "- Rule 1"].join("\n\n");
    const next = applyPostWelcomeSystemPrompt(prompt);
    assert.doesNotMatch(next, /CRITICAL FIRST-CONTACT WELCOME RULES/);
    assert.match(next, /CRITICAL POST-WELCOME RULES/);
    assert.match(next, /Do NOT send another welcome/i);
    assert.match(next, /CRITICAL BOOKING ACTION RULES/);
  });
});
