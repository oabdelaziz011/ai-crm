import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import i18n from "../../i18n";
import { localizeNotification } from "../notification-i18n";

describe("notification localization fixes", () => {
  before(async () => {
    await i18n.changeLanguage("ar");
  });

  it("assignment: no UUID amount/reason spam", () => {
    const t = i18n.getFixedT("ar", "common");
    const result = localizeNotification(
      t,
      {
        title_key: "notifications.platform.templates.genericSystem.title",
        message: JSON.stringify({
          messageKey: "notifications.platform.templates.genericSystem.message",
          params: {
            title: "Conversation assigned to you",
            kind: "assignment",
            detail: "Conversation 9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b",
            body: "Conversation 9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b",
            reason: "Conversation 9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b",
            conversationId: "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b",
            entityType: "conversation",
            channel: "whatsapp",
            customerName: "أحمد",
          },
        }),
      },
      undefined,
      { event: "generic_system", category: "system" },
    );
    assert.match(result.title, /إسناد|محادثة/);
    assert.match(result.message, /أحمد/);
    assert.doesNotMatch(result.message, /بمبلغ|4fbc|Conversation 9de058d8|السبب/);
  });

  it("ticket closed: single clean line", () => {
    const t = i18n.getFixedT("ar", "common");
    const result = localizeNotification(
      t,
      {
        title_key: "notifications.platform.templates.genericSystem.title",
        message: JSON.stringify({
          messageKey: "notifications.platform.templates.genericSystem.message",
          params: {
            title: "ticket_closed",
            kind: "ticket_closed",
            ticketNumber: "TKT-000105",
            subject: "رفع شكوى",
            detail: "TKT-000105 — رفع شكوى",
            body: "TKT-000105 — رفع شكوى",
            reason: "TKT-000105 — رفع شكوى",
          },
        }),
      },
      undefined,
      { event: "generic_system", category: "system" },
    );
    assert.equal(result.message, "TKT-000105 — رفع شكوى");
    assert.doesNotMatch(result.message, /الموضوع:|السبب:|التذكرة TKT/);
  });

  it("subscription unpaid uses Arabic template", () => {
    const t = i18n.getFixedT("ar", "common");
    const result = localizeNotification(
      t,
      {
        title_key: "Company subscription unpaid",
        message: JSON.stringify({
          messageKey: "notifications.platform.templates.genericSystem.message",
          params: {
            companyName: "DEMO Alpha — Trial Company",
            detail:
              "DEMO Alpha — Trial Company exhausted its payment window without renewing.",
            body:
              "DEMO Alpha — Trial Company exhausted its payment window without renewing.",
          },
        }),
      },
      undefined,
      { category: "subscription" },
    );
    assert.match(result.title, /اشتراك/);
    assert.match(result.message, /استنفدت|مهلة/);
    assert.doesNotMatch(result.message, /exhausted/);
  });

  it("inbound: English toast body does not leak under Arabic", () => {
    const t = i18n.getFixedT("ar", "common");
    const result = localizeNotification(
      t,
      {
        title_key: "notifications.platform.templates.genericSystem.title",
        message: JSON.stringify({
          messageKey: "notifications.platform.templates.genericSystem.message",
          params: {
            title: "New inbound message",
            detail: "You received a new WhatsApp message",
            body: "You received a new WhatsApp message",
            channel: "whatsapp",
            channelType: "whatsapp",
            entityType: "conversation",
            conversationId: "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b",
          },
        }),
      },
      undefined,
      { event: "generic_system", category: "system" },
    );
    assert.match(result.title, /رسالة/);
    assert.match(result.message, /واتساب|رسالة/);
    assert.doesNotMatch(result.message, /You received|WhatsApp message/i);
  });

  it("ticket assigned: Arabic title from kind code", () => {
    const t = i18n.getFixedT("ar", "common");
    const result = localizeNotification(
      t,
      {
        title_key: "notifications.platform.templates.genericSystem.title",
        message: JSON.stringify({
          messageKey: "notifications.platform.templates.genericSystem.message",
          params: {
            title: "ticket_assigned",
            kind: "ticket_assigned",
            ticketNumber: "TKT-000200",
            subject: "استفسار فاتورة",
            detail: "",
            body: "",
            entityType: "ticket",
          },
        }),
      },
      undefined,
      { event: "generic_system", category: "system" },
    );
    assert.match(result.title, /إسناد|تذكرة/);
    assert.equal(result.message, "TKT-000200 — استفسار فاتورة");
    assert.doesNotMatch(result.title, /System notification|ticket_assigned/i);
  });
});
