import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EMPLOYEE_CORE_INSTRUCTIONS,
  AI_EMPLOYEE_CORE_INSTRUCTIONS_VERSION,
  CUSTOMER_LANGUAGE_MATCH_INSTRUCTION,
  composeEmployeeSystemInstructions,
  sanitizeCompanyLanguageInstructions,
} from "./employee-core-instructions.js";
import { PolicyBuilder } from "./builders/prompt-builders.js";
import type { PromptContextInput } from "./types.js";

describe("AI employee core instructions", () => {
  it("keeps company instructions after the versioned core block", () => {
    const parts = composeEmployeeSystemInstructions({
      companyInstructions: "Always greet as ValueOR Cairo.",
      retrievalLines: ["[Catalog] Widget lasts 2 years."],
      currentDate: "2026-10-21",
    });
    assert.equal(parts[0]?.includes(AI_EMPLOYEE_CORE_INSTRUCTIONS_VERSION), true);
    assert.equal(parts[1], "CURRENT DATE (Africa/Cairo): 2026-10-21. Tomorrow is 2026-10-22.");
    assert.equal(parts[2], "COMPANY INSTRUCTIONS:\nAlways greet as ValueOR Cairo.");
    assert.match(parts[3] ?? "", /Widget lasts 2 years/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /do not guess a year/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /list_demo_types/);
    assert.ok(AI_EMPLOYEE_CORE_INSTRUCTIONS.length < 2400);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /search_products/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /create_demo_booking/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /request_send_quote/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /Egyptian Arabic/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /English/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /German/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /Do not translate product names/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /not_listed/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /latest message language/);
  });

  it("omits an empty company block instead of erasing the core", () => {
    const parts = composeEmployeeSystemInstructions({ companyInstructions: "  " });
    assert.equal(parts.length, 1);
    assert.match(parts[0] ?? "", /Do not invent prices/);
  });

  it("sanitizes Arabic-forcing company language while preserving booking business rules", () => {
    const company = [
      "أنت مساعد خدمة عملاء على واتساب.",
      "- رد بالعربية بلطف واختصار.",
      "- للحجز: استخدم search_availability ثم create_booking.",
      "- للشكاوى: create_ticket بأولوية مناسبة.",
      "- لا تؤكد حجزاً إلا بعد نجاح create_booking.",
    ].join("\n");

    const sanitized = sanitizeCompanyLanguageInstructions(company);
    assert.match(sanitized, /search_availability/);
    assert.match(sanitized, /create_booking/);
    assert.match(sanitized, /create_ticket/);
    assert.match(sanitized, /latest message language/);
    assert.equal(/رد بالعربية/.test(sanitized), false);

    const parts = composeEmployeeSystemInstructions({ companyInstructions: company });
    const companyBlock = parts.find((part) => part.startsWith("COMPANY INSTRUCTIONS:")) ?? "";
    assert.match(companyBlock, /Match the customer's latest message language/);
    assert.equal(/رد بالعربية/.test(companyBlock), false);
    assert.match(companyBlock, /create_booking/);
  });

  it("sanitizes English fixed-language mandates", () => {
    const sanitized = sanitizeCompanyLanguageInstructions(
      "Always reply in Arabic.\n- Keep tone polite.\nUse search_availability for booking.",
    );
    assert.equal(/Always reply in Arabic/i.test(sanitized), false);
    assert.match(sanitized, /latest message language/);
    assert.match(sanitized, /Keep tone polite/);
    assert.match(sanitized, /search_availability/);
  });
});

describe("PolicyBuilder language matching", () => {
  const baseContext = {
    companyId: "c1",
    conversationId: "v1",
    channel: "web_chat",
    recentMessages: [],
  } as unknown as PromptContextInput;

  it("builds Arabic / English / German critical language sections", () => {
    const builder = new PolicyBuilder();
    for (const language of ["Arabic", "English", "German"] as const) {
      const sections = builder.build({ ...baseContext, language });
      assert.match(sections.language?.content ?? "", /CRITICAL LANGUAGE RULE/);
      assert.match(sections.language?.content ?? "", new RegExp(`Reply only in ${language}`));
      assert.match(sections.language?.content ?? "", /COMPANY INSTRUCTIONS/);
      assert.match(sections.language?.content ?? "", /latest message/);
    }
  });

  it("supports language switching by rebuilding for the latest detected language", () => {
    const builder = new PolicyBuilder();
    const arabic = builder.build({ ...baseContext, language: "Arabic" }).language?.content ?? "";
    const english = builder.build({ ...baseContext, language: "English" }).language?.content ?? "";
    const german = builder.build({ ...baseContext, language: "German" }).language?.content ?? "";

    assert.match(arabic, /Reply only in Arabic/);
    assert.match(english, /Reply only in English/);
    assert.match(german, /Reply only in German/);
    assert.match(english, /If the customer later writes in Arabic, English, or German/);
    assert.equal(CUSTOMER_LANGUAGE_MATCH_INSTRUCTION.includes("switches language"), true);
  });
});
