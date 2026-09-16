/**
 * UI category organization for existing email templates (no DB migration).
 * Templates are grouped by code/name heuristics; empty categories remain guides only.
 */
export type EmailTemplateCategoryId =
  | "complaints"
  | "tickets"
  | "follow_up"
  | "sales"
  | "operations"
  | "customer_service"
  | "other";

export const EMAIL_TEMPLATE_CATEGORY_DEFS: readonly {
  id: Exclude<EmailTemplateCategoryId, "other">;
  labelKey: string;
  match: RegExp;
  /** Suggested names shown as guides when the company has no matching templates. */
  guideExamplesKey: string;
}[] = [
  {
    id: "complaints",
    labelKey: "emailModule.templates.categories.complaints",
    match: /(complaint|apolog|escalat)/i,
    guideExamplesKey: "emailModule.templates.categories.complaintsExamples",
  },
  {
    id: "tickets",
    labelKey: "emailModule.templates.categories.tickets",
    match: /(ticket|sla)/i,
    guideExamplesKey: "emailModule.templates.categories.ticketsExamples",
  },
  {
    id: "follow_up",
    labelKey: "emailModule.templates.categories.followUp",
    match: /(follow)/i,
    guideExamplesKey: "emailModule.templates.categories.followUpExamples",
  },
  {
    id: "sales",
    labelKey: "emailModule.templates.categories.sales",
    match: /(sales|intro|quot|propos|product|meeting|inquiry)/i,
    guideExamplesKey: "emailModule.templates.categories.salesExamples",
  },
  {
    id: "operations",
    labelKey: "emailModule.templates.categories.operations",
    match: /(booking|appoint|ops|confirm|cancel|resched)/i,
    guideExamplesKey: "emailModule.templates.categories.operationsExamples",
  },
  {
    id: "customer_service",
    labelKey: "emailModule.templates.categories.customerService",
    match: /(welcome|thank|resolv|info|support|service)/i,
    guideExamplesKey: "emailModule.templates.categories.customerServiceExamples",
  },
];

export function classifyEmailTemplateCategory(input: {
  name: string;
  code: string;
}): EmailTemplateCategoryId {
  const hay = `${input.code} ${input.name}`;
  for (const def of EMAIL_TEMPLATE_CATEGORY_DEFS) {
    if (def.match.test(hay)) return def.id;
  }
  return "other";
}
