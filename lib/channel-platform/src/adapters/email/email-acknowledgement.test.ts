import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultEmailAcknowledgementConfig,
  normalizeEmailAcknowledgementConfig,
  selectAcknowledgementTemplate,
} from "./email-acknowledgement-config.ts";
import {
  detectAcknowledgementLanguage,
  prepareAcknowledgementDetectionText,
  resolveAcknowledgementLanguageOrNull,
} from "./email-acknowledgement-language.ts";
import { evaluateEmailAcknowledgementEligibility } from "./email-acknowledgement-eligibility.ts";
import {
  acknowledgementHtmlToPlainText,
  buildAcknowledgementOutboundHtml,
} from "./email-acknowledgement-html.ts";
import { renderEmailSignatureHtml } from "./email-signature-config.ts";
import { trySendEmailAcknowledgement } from "./email-acknowledgement.ts";
import type { ChannelDispatcherPort } from "../../ports/channel-platform-ports.js";
import type { ServiceContext } from "../../types.js";

describe("email acknowledgement config", () => {
  it("defaults to OFF with en/ar/fr/de/es templates", () => {
    const config = createDefaultEmailAcknowledgementConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.defaultLanguage, "en");
    assert.deepEqual(
      config.templates.map((t) => t.language).sort(),
      ["ar", "de", "en", "es", "fr"],
    );
  });

  it("persists enabled, default language, and template edits", () => {
    const config = normalizeEmailAcknowledgementConfig({
      enabled: true,
      defaultLanguage: "ar",
      templates: [{ language: "en", enabled: true, body: "Custom EN" }],
    });
    assert.equal(config.enabled, true);
    assert.equal(config.defaultLanguage, "ar");
    assert.equal(config.templates.find((t) => t.language === "en")?.body, "Custom EN");
    assert.ok(config.templates.find((t) => t.language === "ar")?.body.includes("شكر"));
  });

  it("ignores disabled language templates", () => {
    const config = normalizeEmailAcknowledgementConfig({
      enabled: true,
      defaultLanguage: "en",
      templates: [
        { language: "fr", enabled: false, body: "Bonjour" },
        { language: "en", enabled: true, body: "Hello" },
      ],
    });
    const selected = selectAcknowledgementTemplate({ config, detectedLanguage: "fr" });
    assert.equal(selected?.language, "en");
    assert.equal(selected?.reason, "default_language_fallback");
  });

  it("feature OFF → no template selection", () => {
    const config = createDefaultEmailAcknowledgementConfig({ enabled: false });
    assert.equal(selectAcknowledgementTemplate({ config, detectedLanguage: "en" }), null);
  });
});

describe("email acknowledgement language", () => {
  it("detects English inbound", () => {
    const text = prepareAcknowledgementDetectionText({
      subject: "Need help",
      textPlain: "Hello, please could you send more information about your services?",
    });
    const detected = detectAcknowledgementLanguage(text);
    assert.equal(resolveAcknowledgementLanguageOrNull(detected), "en");
  });

  it("detects Arabic inbound", () => {
    const text = prepareAcknowledgementDetectionText({
      subject: "استفسار",
      textPlain: "مرحبا، أحتاج معلومات إضافية عن خدماتكم",
    });
    const detected = detectAcknowledgementLanguage(text);
    assert.equal(resolveAcknowledgementLanguageOrNull(detected), "ar");
  });

  it("detects the real failing German message as German", () => {
    const text = prepareAcknowledgementDetectionText({
      subject: "Guten Morgen,",
      textPlain: "Guten Morgen, meine Liebe, wie geht es dir?",
    });
    const detected = detectAcknowledgementLanguage(text);
    assert.equal(detected.language, "de");
    assert.ok(detected.confidence >= 0.5);
    assert.equal(resolveAcknowledgementLanguageOrNull(detected), "de");
    const selected = selectAcknowledgementTemplate({
      config: createDefaultEmailAcknowledgementConfig({ enabled: true }),
      detectedLanguage: resolveAcknowledgementLanguageOrNull(detected),
    });
    assert.equal(selected?.language, "de");
    assert.equal(selected?.reason, "detected_language");
  });

  it("detects German / French / Spanish long and short messages", () => {
    const cases: Array<{ expected: string; subject?: string; body: string }> = [
      {
        expected: "de",
        body: "Guten Morgen, ich möchte mich nach Ihrem Service erkundigen.",
      },
      {
        expected: "fr",
        body: "Bonjour, je voudrais obtenir plus d'informations sur votre service.",
      },
      {
        expected: "es",
        body: "Hola, me gustaría obtener más información sobre su servicio.",
      },
      { expected: "de", body: "Guten Morgen, wie geht es dir?" },
      { expected: "fr", body: "Bonjour, comment allez-vous ?" },
      { expected: "es", body: "Hola, ¿cómo estás?" },
      { expected: "ar", body: "مساء الخير" },
      { expected: "en", body: "Good morning" },
      { expected: "de", body: "Guten Morgen" },
      { expected: "fr", body: "Bonjour" },
      { expected: "es", body: "Hola" },
      { expected: "de", body: "Vielen Dank für Ihre Nachricht." },
      { expected: "fr", body: "Merci pour votre message." },
      { expected: "es", body: "Gracias por su mensaje." },
    ];
    for (const row of cases) {
      const text = prepareAcknowledgementDetectionText({
        subject: row.subject ?? null,
        textPlain: row.body,
      });
      const detected = detectAcknowledgementLanguage(text);
      assert.equal(
        resolveAcknowledgementLanguageOrNull(detected),
        row.expected,
        `expected ${row.expected} for ${JSON.stringify(row.body)} got ${detected.language} (${detected.reason}) scores=${JSON.stringify(detected.scores)}`,
      );
    }
  });

  it("does not force English for ambiguous Latin text", () => {
    const detected = detectAcknowledgementLanguage("Invoice 99881 status update");
    assert.equal(detected.language, null);
    assert.match(detected.reason, /latin_ambiguous|latin_weak|latin_tie/);
    assert.equal(resolveAcknowledgementLanguageOrNull(detected), null);
  });

  it("selects matching templates for de/fr/es without falling back to English", () => {
    const config = createDefaultEmailAcknowledgementConfig({ enabled: true });
    for (const language of ["de", "fr", "es", "en", "ar"] as const) {
      const selected = selectAcknowledgementTemplate({
        config,
        detectedLanguage: language,
      });
      assert.equal(selected?.language, language);
      assert.equal(selected?.reason, "detected_language");
    }
  });

  it("strips quoted history before detection", () => {
    const text = prepareAcknowledgementDetectionText({
      textPlain: "Thanks\n\nOn Mon wrote:\n> مرحبا جدا جدا جدا جدا جدا",
    });
    assert.ok(!text.includes("مرحبا"));
  });

  it("falls back when detection confidence is insufficient", () => {
    const detected = detectAcknowledgementLanguage("12345 !!!");
    assert.equal(resolveAcknowledgementLanguageOrNull(detected, 0.5), null);
  });
});

describe("email acknowledgement eligibility", () => {
  it("skips own outbound echo and company mailbox from", () => {
    assert.equal(
      evaluateEmailAcknowledgementEligibility({
        channelKey: "email",
        alreadyExistsAsOutgoing: true,
      }).eligible,
      false,
    );
    assert.equal(
      evaluateEmailAcknowledgementEligibility({
        channelKey: "email",
        fromEmail: "desk@example.com",
        companyFromEmail: "desk@example.com",
      }).reason,
      "from_matches_company_mailbox",
    );
  });

  it("skips bounce / OOO / auto-reply signals", () => {
    assert.equal(
      evaluateEmailAcknowledgementEligibility({
        channelKey: "email",
        subject: "Out of Office: away",
      }).eligible,
      false,
    );
    assert.equal(
      evaluateEmailAcknowledgementEligibility({
        channelKey: "email",
        headers: { "auto-submitted": "auto-replied" },
      }).eligible,
      false,
    );
    assert.equal(
      evaluateEmailAcknowledgementEligibility({
        channelKey: "email",
        headers: { "x-valueor-email-automation": "acknowledgement" },
      }).eligible,
      false,
    );
  });

  it("allows genuine customer inbound", () => {
    assert.equal(
      evaluateEmailAcknowledgementEligibility({
        channelKey: "email",
        fromEmail: "customer@example.com",
        companyFromEmail: "desk@example.com",
        subject: "Question about pricing",
      }).eligible,
      true,
    );
  });
});

describe("email acknowledgement html", () => {
  it("orders body → logo → signature exactly once", () => {
    const html = buildAcknowledgementOutboundHtml({
      bodyText: "Thank you for contacting us.",
      logoUrl: "https://cdn.example/logo.png",
      signatureHtml: "<p>Best regards</p>",
    });
    const bodyIdx = html.indexOf("Thank you");
    const logoIdx = html.indexOf('data-email-identity-logo="1"');
    const sigIdx = html.indexOf("data-valueor-email-signature");
    assert.ok(bodyIdx >= 0 && logoIdx > bodyIdx && sigIdx > logoIdx);
    assert.equal((html.match(/data-email-identity-logo="1"/g) ?? []).length, 1);
    assert.equal((html.match(/data-valueor-email-signature/g) ?? []).length, 1);
    assert.ok(acknowledgementHtmlToPlainText(html).includes("Thank you"));
  });

  it("uses structured branding signature HTML without inventing defaults", () => {
    const signatureHtml = renderEmailSignatureHtml({
      name: "Ack Name",
      title: "",
      email: "",
      website: "",
    });
    const html = buildAcknowledgementOutboundHtml({
      bodyText: "Received",
      signatureHtml,
      logoUrl: null,
    });
    assert.match(html, /Ack Name/);
    assert.doesNotMatch(html, /Customer Success Team/);
    assert.doesNotMatch(html, /support@valueor\.com/);
  });
});

describe("trySendEmailAcknowledgement orchestration", () => {
  const ctx = { userId: "u1", companyId: "c1", permissions: [] } as unknown as ServiceContext;

  it("feature OFF → no send", async () => {
    let dispatched = 0;
    const dispatcher: ChannelDispatcherPort = {
      async dispatch() {
        dispatched += 1;
        return { deliveryEventId: "d1", deliveryStatus: "sent" };
      },
    };
    const result = await trySendEmailAcknowledgement({
      ctx,
      dispatcher,
      ports: {
        async loadBranding() {
          return {
            acknowledgement: createDefaultEmailAcknowledgementConfig({ enabled: false }),
            signatureHtml: "",
            logoUrl: null,
            showLegalFooter: false,
            legalText: "",
          };
        },
        async findExistingAcknowledgement() {
          return null;
        },
        async claimOutgoingAcknowledgement() {
          return { id: "out-1", reused: false };
        },
      },
      companyId: "c1",
      companyChannelId: "ch1",
      conversationId: "conv1",
      channelSessionId: "sess1",
      inboundMessageId: "in1",
      externalThreadId: "thread-1",
      senderExternalId: "customer@example.com",
      companyFromEmail: "desk@example.com",
      subject: "Hello",
      textPlain: "Hello, I need information please.",
    });
    assert.equal(result.reason, "disabled");
    assert.equal(dispatched, 0);
  });

  it("English inbound → English template via existing dispatcher", async () => {
    let dispatchedHtml = "";
    let dispatchedMeta: Record<string, unknown> | undefined;
    const dispatcher: ChannelDispatcherPort = {
      async dispatch(_ctx, request) {
        dispatchedHtml = String(request.metadata?.htmlSanitized ?? "");
        dispatchedMeta = request.metadata;
        return { deliveryEventId: "d1", deliveryStatus: "sent" };
      },
    };
    const result = await trySendEmailAcknowledgement({
      ctx,
      dispatcher,
      ports: {
        async loadBranding() {
          return {
            acknowledgement: createDefaultEmailAcknowledgementConfig({ enabled: true }),
            signatureHtml: "<p>Sig</p>",
            logoUrl: "https://cdn.example/logo.png",
            showLegalFooter: false,
            legalText: "",
          };
        },
        async findExistingAcknowledgement() {
          return null;
        },
        async claimOutgoingAcknowledgement(input) {
          assert.match(input.externalMessageId, /^valueor-ack:/);
          return { id: "out-1", reused: false };
        },
      },
      companyId: "c1",
      companyChannelId: "ch1",
      conversationId: "conv1",
      channelSessionId: "sess1",
      inboundMessageId: "in1",
      externalThreadId: "thread-1",
      externalMessageId: "<msg-1@example.com>",
      senderExternalId: "customer@example.com",
      companyFromEmail: "desk@example.com",
      subject: "Hello",
      textPlain: "Hello, please could you send information about your services?",
    });
    assert.equal(result.sent, true);
    assert.equal(result.language, "en");
    assert.match(dispatchedHtml, /Thank you for contacting us/);
    assert.match(dispatchedHtml, /data-email-identity-logo/);
    assert.match(dispatchedHtml, /data-valueor-email-signature/);
    assert.equal((dispatchedMeta?.emailAutomation as { type?: string })?.type, "acknowledgement");
  });

  it("Arabic inbound → Arabic template", async () => {
    let dispatchedHtml = "";
    const dispatcher: ChannelDispatcherPort = {
      async dispatch(_ctx, request) {
        dispatchedHtml = String(request.metadata?.htmlSanitized ?? "");
        return { deliveryEventId: "d1", deliveryStatus: "sent" };
      },
    };
    const result = await trySendEmailAcknowledgement({
      ctx,
      dispatcher,
      ports: {
        async loadBranding() {
          return {
            acknowledgement: createDefaultEmailAcknowledgementConfig({ enabled: true }),
            signatureHtml: "<p>توقيع</p>",
            logoUrl: null,
            showLegalFooter: false,
            legalText: "",
          };
        },
        async findExistingAcknowledgement() {
          return null;
        },
        async claimOutgoingAcknowledgement() {
          return { id: "out-ar", reused: false };
        },
      },
      companyId: "c1",
      companyChannelId: "ch1",
      conversationId: "conv1",
      channelSessionId: "sess1",
      inboundMessageId: "in-ar",
      externalThreadId: "thread-ar",
      senderExternalId: "customer@example.com",
      companyFromEmail: "desk@example.com",
      subject: "استفسار",
      textPlain: "مرحبا، أحتاج معلومات إضافية عن خدماتكم من فضلكم",
    });
    assert.equal(result.sent, true);
    assert.equal(result.language, "ar");
    assert.match(dispatchedHtml, /شكرًا لتواصلك معنا/);
  });

  it("same inbound twice → one acknowledgement", async () => {
    let dispatched = 0;
    const dispatcher: ChannelDispatcherPort = {
      async dispatch() {
        dispatched += 1;
        return { deliveryEventId: "d1", deliveryStatus: "sent" };
      },
    };
    const ports = {
      async loadBranding() {
        return {
          acknowledgement: createDefaultEmailAcknowledgementConfig({ enabled: true }),
          signatureHtml: "",
          logoUrl: null,
          showLegalFooter: false,
          legalText: "",
        };
      },
      async findExistingAcknowledgement() {
        return dispatched > 0
          ? { id: "out-1", status: "sent", dispatchConfirmed: true, dispatchFailed: false }
          : null;
      },
      async claimOutgoingAcknowledgement() {
        return { id: "out-1", reused: dispatched > 0 };
      },
    };
    const base = {
      ctx,
      dispatcher,
      ports,
      companyId: "c1",
      companyChannelId: "ch1",
      conversationId: "conv1",
      channelSessionId: "sess1",
      inboundMessageId: "in1",
      externalThreadId: "thread-1",
      senderExternalId: "customer@example.com",
      companyFromEmail: "desk@example.com",
      subject: "Hello",
      textPlain: "Hello please help with my account",
    } as const;

    const first = await trySendEmailAcknowledgement(base);
    const second = await trySendEmailAcknowledgement(base);
    assert.equal(first.sent, true);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, "already_acknowledged");
    assert.equal(dispatched, 1);
  });

  it("SMTP failure does not throw (inbound isolation)", async () => {
    const dispatcher: ChannelDispatcherPort = {
      async dispatch() {
        throw new Error("smtp_down");
      },
    };
    const result = await trySendEmailAcknowledgement({
      ctx,
      dispatcher,
      ports: {
        async loadBranding() {
          return {
            acknowledgement: createDefaultEmailAcknowledgementConfig({ enabled: true }),
            signatureHtml: "",
            logoUrl: null,
            showLegalFooter: false,
            legalText: "",
          };
        },
        async findExistingAcknowledgement() {
          return null;
        },
        async claimOutgoingAcknowledgement() {
          return { id: "out-1", reused: false };
        },
      },
      companyId: "c1",
      companyChannelId: "ch1",
      conversationId: "conv1",
      channelSessionId: "sess1",
      inboundMessageId: "in1",
      externalThreadId: "thread-1",
      senderExternalId: "customer@example.com",
      companyFromEmail: "desk@example.com",
      subject: "Hello",
      textPlain: "Hello please help",
    });
    assert.equal(result.reason, "send_failed");
    assert.equal(result.sent, false);
  });

  it("does not import or call AI draft paths", async () => {
    // Structural isolation: this module graph must not reference AI draft generators.
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./email-acknowledgement.ts", import.meta.url), "utf8"),
    );
    assert.equal(source.includes("generateEmailAiDraft"), false);
    assert.equal(source.includes("openai"), false);
    assert.equal(source.includes("gemini"), false);
  });
});
