export type EmailTemplateVariableKey =
  | "company.name"
  | "customer.name"
  | "customer.email"
  | "ticket.number"
  | "ticket.subject"
  | "booking.reference";

export type EmailTemplateVariableDefinition = {
  key: EmailTemplateVariableKey;
  token: `{{${EmailTemplateVariableKey}}}`;
  labelKey: string;
};

export const EMAIL_TEMPLATE_VARIABLES: readonly EmailTemplateVariableDefinition[] = [
  {
    key: "company.name",
    token: "{{company.name}}",
    labelKey: "emailModule.templates.variables.companyName",
  },
  {
    key: "customer.name",
    token: "{{customer.name}}",
    labelKey: "emailModule.templates.variables.customerName",
  },
  {
    key: "customer.email",
    token: "{{customer.email}}",
    labelKey: "emailModule.templates.variables.customerEmail",
  },
  {
    key: "ticket.number",
    token: "{{ticket.number}}",
    labelKey: "emailModule.templates.variables.ticketNumber",
  },
  {
    key: "ticket.subject",
    token: "{{ticket.subject}}",
    labelKey: "emailModule.templates.variables.ticketSubject",
  },
  {
    key: "booking.reference",
    token: "{{booking.reference}}",
    labelKey: "emailModule.templates.variables.bookingReference",
  },
] as const;

export type EmailTemplateRenderContext = Partial<Record<EmailTemplateVariableKey, string>>;

export const EMAIL_TEMPLATE_PREVIEW_CONTEXT: EmailTemplateRenderContext = {
  "company.name": "Example Company",
  "customer.name": "Ahmed",
  "customer.email": "customer@example.com",
  "ticket.number": "TCK-1001",
  "ticket.subject": "Example Support Request",
  "booking.reference": "BK-1001",
};

export type CompanyEmailTemplate = {
  id: string;
  companyId: string;
  name: string;
  code: string;
  subject: string;
  body: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type EmailTemplateInput = {
  name: string;
  code: string;
  subject: string;
  body: string;
  enabled: boolean;
};

export const EMAIL_TEMPLATE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizeEmailTemplateCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
}

export function isValidEmailTemplateCode(code: string): boolean {
  return EMAIL_TEMPLATE_CODE_PATTERN.test(code);
}
