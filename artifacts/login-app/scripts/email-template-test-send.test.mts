import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SendEmailTemplateError,
  sendEmailTemplate,
  textToSafeEmailHtml,
} from "../src/lib/email-templates/send-email-template.ts";
import { EMAIL_TEMPLATE_PREVIEW_CONTEXT } from "../src/lib/email-templates/types.ts";

const baseTemplate = {
  id: "tpl-1",
  companyId: "company-a",
  name: "Welcome Customer",
  code: "welcome_customer",
  subject: "Welcome {{customer.name}}",
  body: "Hello {{customer.name}}, welcome to {{company.name}}.",
  enabled: true,
};

describe("sendEmailTemplate (Sprint 2)", () => {
  it("rejects invalid recipient", async () => {
    await assert.rejects(
      () =>
        sendEmailTemplate(
          { companyId: "company-a", templateId: "tpl-1", recipientEmail: "not-an-email" },
          {
            loadTemplate: async () => baseTemplate,
            sendRendered: async () => ({ ok: true }),
          },
        ),
      (err: unknown) => err instanceof SendEmailTemplateError && err.code === "invalid_recipient",
    );
  });

  it("rejects cross-company template (ownership)", async () => {
    await assert.rejects(
      () =>
        sendEmailTemplate(
          { companyId: "company-a", templateId: "tpl-1", recipientEmail: "you@example.com" },
          {
            loadTemplate: async () => ({ ...baseTemplate, companyId: "company-b" }),
            sendRendered: async () => ({ ok: true }),
          },
        ),
      (err: unknown) => err instanceof SendEmailTemplateError && err.code === "not_found",
    );
  });

  it("rejects missing template", async () => {
    await assert.rejects(
      () =>
        sendEmailTemplate(
          { companyId: "company-a", templateId: "missing", recipientEmail: "you@example.com" },
          {
            loadTemplate: async () => null,
            sendRendered: async () => ({ ok: true }),
          },
        ),
      (err: unknown) => err instanceof SendEmailTemplateError && err.code === "not_found",
    );
  });

  it("rejects disabled template", async () => {
    await assert.rejects(
      () =>
        sendEmailTemplate(
          { companyId: "company-a", templateId: "tpl-1", recipientEmail: "you@example.com" },
          {
            loadTemplate: async () => ({ ...baseTemplate, enabled: false }),
            sendRendered: async () => ({ ok: true }),
          },
        ),
      (err: unknown) => err instanceof SendEmailTemplateError && err.code === "disabled",
    );
  });

  it("renders variables and sends via provider boundary", async () => {
    const calls: Array<Record<string, string>> = [];
    const result = await sendEmailTemplate(
      {
        companyId: "company-a",
        templateId: "tpl-1",
        recipientEmail: "you@example.com",
        context: EMAIL_TEMPLATE_PREVIEW_CONTEXT,
      },
      {
        loadTemplate: async () => baseTemplate,
        sendRendered: async (args) => {
          calls.push({
            to: args.to,
            subject: args.subject,
            text: args.text,
            companyId: args.companyId,
          });
          return { ok: true };
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.subject, "Welcome Ahmed");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.subject, "Welcome Ahmed");
    assert.equal(calls[0]?.text, "Hello Ahmed, welcome to Example Company.");
    assert.equal(calls[0]?.companyId, "company-a");
  });

  it("sanitizes provider failures without exposing secrets", async () => {
    await assert.rejects(
      () =>
        sendEmailTemplate(
          { companyId: "company-a", templateId: "tpl-1", recipientEmail: "you@example.com" },
          {
            loadTemplate: async () => baseTemplate,
            sendRendered: async () => {
              throw new Error("SMTP auth failed password=super-secret api_key=sk_live_123");
            },
          },
        ),
      (err: unknown) => {
        if (!(err instanceof SendEmailTemplateError) || err.code !== "provider_error") return false;
        assert.doesNotMatch(err.message, /super-secret|sk_live/);
        assert.match(err.message, /redacted/i);
        return true;
      },
    );
  });

  it("escapes html safely for body transport", () => {
    assert.equal(textToSafeEmailHtml('Hi <b>x</b> & "y"'), "Hi &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;");
  });
});
