import {
  EMAIL_TEMPLATE_PREVIEW_CONTEXT,
  type CompanyEmailTemplate,
  type EmailTemplateRenderContext,
} from "./types";
import { renderEmailTemplate } from "./email-template-renderer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendEmailTemplateInput = {
  companyId: string;
  templateId: string;
  recipientEmail: string;
  context?: EmailTemplateRenderContext;
};

export type SendEmailTemplateDeps = {
  loadTemplate: (
    companyId: string,
    templateId: string,
  ) => Promise<Pick<CompanyEmailTemplate, "id" | "companyId" | "code" | "name" | "subject" | "body" | "enabled"> | null>;
  sendRendered: (args: {
    companyId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    templateId: string;
    templateCode: string;
  }) => Promise<{ ok: true }>;
};

export type SendEmailTemplateResult = {
  ok: true;
  templateId: string;
  templateCode: string;
  recipientEmail: string;
  subject: string;
  unresolved: string[];
};

export class SendEmailTemplateError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "disabled"
      | "invalid_recipient"
      | "provider_error"
      | "forbidden",
  ) {
    super(message);
    this.name = "SendEmailTemplateError";
  }
}

export function isValidTestRecipientEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function textToSafeEmailHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}

/** Pure orchestration: ownership + enabled + render + outbound send boundary. */
export async function sendEmailTemplate(
  input: SendEmailTemplateInput,
  deps: SendEmailTemplateDeps,
): Promise<SendEmailTemplateResult> {
  const recipientEmail = input.recipientEmail.trim();
  if (!isValidTestRecipientEmail(recipientEmail)) {
    throw new SendEmailTemplateError("A valid recipient email is required.", "invalid_recipient");
  }

  const template = await deps.loadTemplate(input.companyId, input.templateId);
  if (!template || template.companyId !== input.companyId) {
    throw new SendEmailTemplateError("Template not found for this company.", "not_found");
  }
  if (!template.enabled) {
    throw new SendEmailTemplateError("Disabled templates cannot be sent.", "disabled");
  }

  const context = input.context ?? EMAIL_TEMPLATE_PREVIEW_CONTEXT;
  const rendered = renderEmailTemplate(
    { subject: template.subject, body: template.body },
    context,
  );

  try {
    await deps.sendRendered({
      companyId: input.companyId,
      to: recipientEmail,
      subject: rendered.subject,
      text: rendered.body,
      html: textToSafeEmailHtml(rendered.body),
      templateId: template.id,
      templateCode: template.code,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? sanitizeProviderError(error.message)
        : "Outbound email send failed.";
    throw new SendEmailTemplateError(message, "provider_error");
  }

  return {
    ok: true,
    templateId: template.id,
    templateCode: template.code,
    recipientEmail,
    subject: rendered.subject,
    unresolved: rendered.unresolved,
  };
}

function sanitizeProviderError(message: string): string {
  return message
    .replace(/pass(word)?[=:].+/gi, "password=[redacted]")
    .replace(/api[_-]?key[=:].+/gi, "api_key=[redacted]")
    .slice(0, 240);
}
