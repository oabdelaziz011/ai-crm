/**
 * Pure draft mapping for the Opportunity create form.
 * Kept free of React so regression tests can lock create → command contracts.
 */

import { resolveDefaultOpportunityNameFromLead } from "@workspace/opportunity-platform";
import type { LeadReadModel } from "@workspace/application-layer";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";

export type OpportunityLeadSeedSource = Readonly<{
  id: string;
  name: string;
  contactPerson: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  ownerId: string | null;
  expectedValue: number | null;
  currency: string;
  expectedCloseDate: string | null;
  stage: string;
}>;

export function leadWorkspaceRowToOpportunitySeed(row: LeadWorkspaceRow): OpportunityLeadSeedSource {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    companyName: row.companyName,
    email: row.email,
    phone: row.phone,
    ownerId: row.ownerId,
    expectedValue: row.expectedValue,
    currency: row.currency,
    expectedCloseDate: row.expectedCloseDate,
    stage: row.stage,
  };
}

export function leadReadModelToOpportunitySeed(lead: LeadReadModel): OpportunityLeadSeedSource {
  return {
    id: lead.id,
    name: lead.name,
    contactPerson: lead.contactPerson,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    ownerId: lead.ownerId,
    expectedValue: lead.expectedValue,
    currency: lead.currency,
    expectedCloseDate: lead.expectedCloseDate,
    stage: lead.stage,
  };
}

export type OpportunityFormDraft = {
  name: string;
  companyName: string;
  primaryContactName: string;
  expectedRevenue: string;
  currency: string;
  expectedCloseDate: string;
  stageId: string;
  ownerUserId: string;
  pipelineId: string;
};

export const EMPTY_OPPORTUNITY_FORM_DRAFT: OpportunityFormDraft = {
  name: "",
  companyName: "",
  primaryContactName: "",
  expectedRevenue: "",
  currency: "",
  expectedCloseDate: "",
  stageId: "",
  ownerUserId: "",
  pipelineId: "",
};

export type OpportunityFormOption = {
  id: string;
  label: string;
};

export type OpportunityFormFieldErrors = Partial<Record<keyof OpportunityFormDraft | "form", string>>;

export function validateOpportunityFormDraft(
  draft: OpportunityFormDraft,
  t: (key: string) => string,
): OpportunityFormFieldErrors {
  const errors: OpportunityFormFieldErrors = {};
  if (!draft.name.trim()) errors.name = t("opportunities.createForm.errors.nameRequired");
  if (!draft.stageId.trim()) errors.stageId = t("opportunities.createForm.errors.stageRequired");
  if (!draft.pipelineId.trim()) errors.pipelineId = t("opportunities.createForm.errors.pipelineRequired");
  if (!draft.ownerUserId.trim()) errors.ownerUserId = t("opportunities.createForm.errors.ownerRequired");
  if (!draft.currency.trim()) errors.currency = t("opportunities.createForm.errors.currencyRequired");
  if (draft.expectedRevenue.trim()) {
    const value = Number(draft.expectedRevenue);
    if (!Number.isFinite(value) || value < 0) {
      errors.expectedRevenue = t("opportunities.createForm.errors.amountInvalid");
    }
  }
  return errors;
}

export function hasOpportunityFormErrors(errors: OpportunityFormFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function buildManualOpportunityFormSeed(input: {
  companyCurrency: string;
  defaultOwnerUserId?: string;
  defaultStageId?: string;
  defaultPipelineId?: string;
}): OpportunityFormDraft {
  return {
    ...EMPTY_OPPORTUNITY_FORM_DRAFT,
    currency: input.companyCurrency,
    ownerUserId: input.defaultOwnerUserId ?? "",
    stageId: input.defaultStageId ?? "",
    pipelineId: input.defaultPipelineId ?? "",
  };
}

export function buildLeadOpportunityFormSeed(
  lead: OpportunityLeadSeedSource,
  input: {
    companyCurrency: string;
    defaultOwnerUserId?: string;
    defaultStageId?: string;
    defaultPipelineId?: string;
  },
): OpportunityFormDraft {
  const resolvedCurrency = input.companyCurrency.trim().toUpperCase();

  return {
    ...EMPTY_OPPORTUNITY_FORM_DRAFT,
    name: resolveDefaultOpportunityNameFromLead({
      title: lead.name,
      companyName: lead.companyName,
    }),
    companyName: lead.companyName ?? "",
    primaryContactName: lead.contactPerson ?? "",
    expectedRevenue: lead.expectedValue != null ? String(lead.expectedValue) : "",
    currency: resolvedCurrency,
    expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.slice(0, 10) : "",
    ownerUserId: lead.ownerId ?? input.defaultOwnerUserId ?? "",
    stageId: input.defaultStageId ?? "",
    pipelineId: input.defaultPipelineId ?? "",
  };
}

export function opportunityFormDraftToManualCreateInput(draft: OpportunityFormDraft) {
  return {
    name: draft.name.trim(),
    companyName: draft.companyName.trim() || undefined,
    primaryContactName: draft.primaryContactName.trim() || undefined,
    ownerUserId: draft.ownerUserId,
    expectedRevenue: draft.expectedRevenue.trim() ? Number(draft.expectedRevenue) : undefined,
    currency: draft.currency.trim(),
    expectedCloseDate: draft.expectedCloseDate.trim() || null,
    stageId: draft.stageId,
    pipelineId: draft.pipelineId || undefined,
  };
}

export function opportunityFormDraftToCreateFromLeadInput(
  leadId: string,
  draft: OpportunityFormDraft,
) {
  return {
    leadId,
    name: draft.name.trim(),
    companyName: draft.companyName.trim() || undefined,
    primaryContactName: draft.primaryContactName.trim() || undefined,
    ownerUserId: draft.ownerUserId,
    expectedRevenue: draft.expectedRevenue.trim() ? Number(draft.expectedRevenue) : null,
    currency: draft.currency.trim(),
    expectedCloseDate: draft.expectedCloseDate.trim() || null,
    stageId: draft.stageId,
    pipelineId: draft.pipelineId || undefined,
  };
}
