/**
 * Ticket resolution AI draft — unit tests (mocked AI; no live provider).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TICKET_RESOLUTION_AI_CLOSE_PERMISSION,
  TICKET_RESOLUTION_AI_FEATURE_CODE,
  TICKET_RESOLUTION_AI_PERMISSION,
  buildTicketResolutionAiSystemPrompt,
  buildTicketResolutionAiUserPrompt,
  parseAndValidateTicketResolutionAiOutput,
} from "./ticket-resolution-ai-draft.js";
import {
  EMAIL_AI_DRAFT_FEATURE_CODE,
  EMAIL_AI_DRAFT_PERMISSION,
} from "./email-ai-draft.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ticket-resolution-ai-draft reuse of Email AI infrastructure", () => {
  it("reuses ai_assistant + ai.conversations.reply gates", () => {
    assert.equal(TICKET_RESOLUTION_AI_FEATURE_CODE, EMAIL_AI_DRAFT_FEATURE_CODE);
    assert.equal(TICKET_RESOLUTION_AI_PERMISSION, EMAIL_AI_DRAFT_PERMISSION);
    assert.equal(TICKET_RESOLUTION_AI_CLOSE_PERMISSION, "tickets.close");
  });

  it("service imports platform-ai-provider and ai-provider-layer (no separate OpenAI client)", () => {
    const src = readFileSync(join(__dirname, "ticket-resolution-ai-draft.ts"), "utf8");
    assert.match(src, /@workspace\/platform-ai-provider/);
    assert.match(src, /@workspace\/ai-provider-layer/);
    assert.doesNotMatch(src, /from ["']openai["']/);
    assert.doesNotMatch(src, /new OpenAI/);
  });
});

describe("parseAndValidateTicketResolutionAiOutput", () => {
  it("parses English generation", () => {
    const parsed = parseAndValidateTicketResolutionAiOutput(
      JSON.stringify({
        body: "Hello Sam, ticket TKT-100 has been resolved successfully.",
        language: "en",
        tone: "professional",
      }),
    );
    assert.equal(parsed.language, "en");
    assert.match(parsed.body, /TKT-100/);
    assert.match(parsed.body, /Sam/);
  });

  it("parses Arabic generation", () => {
    const parsed = parseAndValidateTicketResolutionAiOutput(
      JSON.stringify({
        body: "مرحبًا سارة، تم حل التذكرة TKT-200 بنجاح.",
        language: "ar",
        tone: "friendly",
      }),
    );
    assert.equal(parsed.language, "ar");
    assert.match(parsed.body, /TKT-200/);
    assert.match(parsed.body, /سارة/);
  });

  it("accepts markdown-fenced JSON", () => {
    const parsed = parseAndValidateTicketResolutionAiOutput(
      "```json\n" +
        JSON.stringify({ body: "Resolved ticket TKT-1.", language: "en", tone: "concise" }) +
        "\n```",
    );
    assert.match(parsed.body, /TKT-1/);
  });

  it("rejects empty body", () => {
    assert.throws(
      () =>
        parseAndValidateTicketResolutionAiOutput(
          JSON.stringify({ body: "  ", language: "en", tone: "professional" }),
        ),
      /empty/i,
    );
  });

  it("defaults invalid language/tone safely", () => {
    const parsed = parseAndValidateTicketResolutionAiOutput(
      JSON.stringify({ body: "Hello", language: "xx", tone: "dramatic" }),
    );
    assert.equal(parsed.language, "en");
    assert.equal(parsed.tone, "professional");
  });
});

describe("buildTicketResolutionAiUserPrompt", () => {
  it("includes ticket number, customer name, channel, and fallback template", () => {
    const prompt = buildTicketResolutionAiUserPrompt({
      instruction: "Write a resolution message",
      mode: "generate",
      tone: "professional",
      outputLanguage: "en",
      channelKey: "whatsapp",
      ticketNumber: "TKT-9",
      ticketSubject: "Billing question",
      ticketStatus: "resolved",
      ticketPriority: "normal",
      customerName: "Alex",
      companyName: "ValueOR",
      resolutionNote: "Issue fixed after password reset.",
      fallbackTemplate: "Hello Alex,\nYour ticket TKT-9 is resolved.",
      currentDraft: "",
      threadText: "Customer: Need help\nAgent: Reset done",
    });
    assert.match(prompt, /TKT-9/);
    assert.match(prompt, /Alex/);
    assert.match(prompt, /whatsapp/);
    assert.match(prompt, /password reset/);
    assert.match(prompt, /Fallback template/);
    assert.match(prompt, /Billing question/);
  });

  it("marks missing resolution note as none (no invented facts)", () => {
    const prompt = buildTicketResolutionAiUserPrompt({
      instruction: "Write a resolution message",
      mode: "generate",
      tone: "professional",
      outputLanguage: "ar",
      channelKey: "email",
      ticketNumber: "TKT-1",
      ticketSubject: "Help",
      ticketStatus: "open",
      ticketPriority: "high",
      customerName: null,
      companyName: "Acme",
      resolutionNote: null,
      fallbackTemplate: "Template",
      currentDraft: "",
      threadText: "",
    });
    assert.match(prompt, /Resolution note: \(none/);
    assert.match(prompt, /do not invent a name/i);
  });
});

describe("buildTicketResolutionAiSystemPrompt safety", () => {
  it("forbids inventing facts, channel selection, and sending", () => {
    const system = buildTicketResolutionAiSystemPrompt();
    assert.match(system, /NEVER send/i);
    assert.match(system, /NEVER choose a channel/i);
    assert.match(system, /Do not invent resolution details/i);
    assert.match(system, /Never mention that the message was AI-generated/i);
  });
});

describe("ticket-resolution-ai route never-send isolation", () => {
  it("route marks neverSend and does not call outbound dispatch", () => {
    const routeSrc = readFileSync(join(__dirname, "../routes/ticket-resolution-ai-draft.ts"), "utf8");
    assert.match(routeSrc, /neverSend:\s*true/);
    assert.doesNotMatch(routeSrc, /dispatchOutboundMessage/);
    assert.doesNotMatch(routeSrc, /notifyTicketResolved/);
    assert.doesNotMatch(routeSrc, /closeTicket/);
  });
});
