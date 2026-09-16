/**
 * Trusted company template context for Email Workspace.
 * Company name comes from authenticated profile.company_id → company record
 * (optional Brand Center name for the same companyId). Never from browser-invented IDs.
 */
import { renderEmailTemplate } from "@/lib/email-templates/email-template-renderer";
import type { EmailTemplateRenderContext } from "@/lib/email-templates/types";
import { findUnresolvedTemplateTokens } from "@/lib/email-workspace/email-composer-rich-text";

const COMPANY_TOKEN_KEYS = new Set(["company.name"]);

export type TrustedCompanyTemplateSource = {
  /** Must be profile.company_id from authenticated session. */
  profileCompanyId: string | null | undefined;
  /** Company row loaded for the authenticated session (must match profileCompanyId). */
  company: { id: string; name: string | null } | null | undefined;
  /**
   * Optional Brand Center general.companyName already scoped by the same companyId.
   * Used only when company.name is empty — never as a cross-tenant override.
   */
  brandCenterCompanyName?: string | null | undefined;
};

/** Resolve the tenant company display name for {{company.name}}. */
export function resolveTrustedCompanyNameForEmailTemplates(
  input: TrustedCompanyTemplateSource,
): string | null {
  const companyId = typeof input.profileCompanyId === "string" ? input.profileCompanyId.trim() : "";
  if (!companyId) return null;

  if (input.company && input.company.id === companyId) {
    const name = typeof input.company.name === "string" ? input.company.name.trim() : "";
    if (name) return name;
  }

  const brand =
    typeof input.brandCenterCompanyName === "string" ? input.brandCenterCompanyName.trim() : "";
  return brand || null;
}

/** Build render context containing only trusted company variables. */
export function buildTrustedCompanyTemplateContext(
  input: TrustedCompanyTemplateSource,
): EmailTemplateRenderContext {
  const name = resolveTrustedCompanyNameForEmailTemplates(input);
  if (!name) return {};
  return { "company.name": name };
}

export function buildEmailWorkspaceTemplateRenderContext(input: {
  trustedCompany: TrustedCompanyTemplateSource;
  customer?: { name?: string | null; email?: string | null } | null;
  ticket?: {
    ticketNumber?: string | null;
    subject?: string | null;
    status?: string | null;
    priority?: string | null;
  } | null;
}): EmailTemplateRenderContext {
  const context: EmailTemplateRenderContext = {
    ...buildTrustedCompanyTemplateContext(input.trustedCompany),
  };
  const customerName = input.customer?.name?.trim();
  const customerEmail = input.customer?.email?.trim();
  if (customerName) context["customer.name"] = customerName;
  if (customerEmail) context["customer.email"] = customerEmail;

  const ticketNumber = input.ticket?.ticketNumber?.trim();
  const ticketSubject = input.ticket?.subject?.trim();
  const ticketStatus = input.ticket?.status?.trim();
  const ticketPriority = input.ticket?.priority?.trim();
  if (ticketNumber) context["ticket.number"] = ticketNumber;
  if (ticketSubject) context["ticket.subject"] = ticketSubject;
  if (ticketStatus) context["ticket.status"] = ticketStatus;
  if (ticketPriority) context["ticket.priority"] = ticketPriority;

  return context;
}

/** Resolve only company.* tokens; leave customer/ticket tokens intact. */
export function resolveCompanyTemplateVariablesInText(
  text: string,
  trustedCompany: TrustedCompanyTemplateSource,
): string {
  const companyContext = buildTrustedCompanyTemplateContext(trustedCompany);
  if (!companyContext["company.name"]) return String(text ?? "");
  return renderEmailTemplate({ subject: String(text ?? ""), body: "" }, companyContext).subject;
}

/** Resolve company variables in both subject and HTML/plain body. */
export function resolveCompanyTemplateVariablesInComposerContent(input: {
  subject: string;
  body: string;
  trustedCompany: TrustedCompanyTemplateSource;
}): { subject: string; body: string } {
  const context = buildTrustedCompanyTemplateContext(input.trustedCompany);
  if (!context["company.name"]) {
    return { subject: input.subject, body: input.body };
  }
  const rendered = renderEmailTemplate(
    { subject: input.subject, body: input.body },
    context,
  );
  return { subject: rendered.subject, body: rendered.body };
}

/**
 * Unresolved tokens after applying trusted company context.
 * Company tokens that resolved are excluded; customer/ticket tokens remain protected.
 */
export function findUnresolvedTemplateTokensAfterCompanyResolution(
  parts: string[],
  trustedCompany: TrustedCompanyTemplateSource,
): string[] {
  const context = buildTrustedCompanyTemplateContext(trustedCompany);
  const resolvedParts = parts.map((part) =>
    context["company.name"]
      ? renderEmailTemplate({ subject: part, body: "" }, context).subject
      : part,
  );
  return findUnresolvedTemplateTokens(...resolvedParts).filter(
    (token) => !COMPANY_TOKEN_KEYS.has(token),
  );
}

/** True when token is a company variable that the trusted context can satisfy. */
export function isResolvableCompanyTemplateToken(
  token: string,
  trustedCompany: TrustedCompanyTemplateSource,
): boolean {
  const key = String(token ?? "").trim().toLowerCase();
  if (!COMPANY_TOKEN_KEYS.has(key)) return false;
  return Boolean(resolveTrustedCompanyNameForEmailTemplates(trustedCompany));
}
