/**
 * Pure draft mapping for the shared Lead create/edit form.
 * Kept free of React so regression tests can lock Edit → updateLead contracts.
 */

export type LeadsFormDraft = {
  name: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  stageId: string;
  ownerId: string;
  sourceId: string;
  expectedValue: string;
  expectedCloseDate: string;
  priority: string;
  temperature: "hot" | "warm" | "cold" | "";
  tags: string[];
  notes: string;
};

export const EMPTY_LEADS_FORM_DRAFT: LeadsFormDraft = {
  name: "",
  companyName: "",
  contactPerson: "",
  email: "",
  phone: "",
  stageId: "",
  ownerId: "",
  sourceId: "",
  expectedValue: "",
  expectedCloseDate: "",
  priority: "",
  temperature: "",
  tags: [],
  notes: "",
};

export type LeadEditSource = {
  name: string;
  contactPerson: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  stageId: string;
  ownerId: string | null;
  sourceId: string | null;
  expectedValue: number | null;
  expectedCloseDate: string | null;
  priority: string;
  temperature: "hot" | "warm" | "cold" | null;
  tags: string[];
  notes: string;
};

export function leadToFormDraft(lead: LeadEditSource): LeadsFormDraft {
  return {
    name: lead.name ?? "",
    companyName: lead.companyName ?? "",
    contactPerson: lead.contactPerson ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    stageId: lead.stageId ?? "",
    ownerId: lead.ownerId ?? "",
    sourceId: lead.sourceId ?? "",
    expectedValue: lead.expectedValue != null ? String(lead.expectedValue) : "",
    expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.slice(0, 10) : "",
    priority: lead.priority ?? "",
    temperature: lead.temperature ?? "",
    tags: [...(lead.tags ?? [])],
    notes: lead.notes ?? "",
  };
}

/** Maps edit-form draft → updateLead command patch (no duplicate update services). */
export function leadFormDraftToUpdatePatch(draft: LeadsFormDraft): {
  name: string;
  contactPerson: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  stageId: string;
  ownerId: string | null;
  sourceId: string | null;
  priority: string | undefined;
  expectedValue: number | null;
  expectedCloseDate: string | null;
  temperature: "hot" | "warm" | "cold" | null;
  tags: string[];
  notes: string;
} {
  return {
    name: draft.name.trim(),
    contactPerson: draft.contactPerson.trim() || draft.name.trim(),
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    companyName: draft.companyName.trim() || null,
    stageId: draft.stageId,
    ownerId: draft.ownerId || null,
    sourceId: draft.sourceId || null,
    priority: draft.priority || undefined,
    expectedValue: draft.expectedValue.trim() ? Number(draft.expectedValue) : null,
    expectedCloseDate: draft.expectedCloseDate.trim() || null,
    temperature: draft.temperature || null,
    tags: draft.tags,
    notes: draft.notes.trim(),
  };
}
