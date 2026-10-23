import type { LeadRecord, LeadSummary } from "@workspace/lead-platform";

export type LeadAgentToolPorts = {
  createLead(input: {
    companyId: string;
    userId: string;
    title: string;
    contactName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    conversationId?: string;
    aiSummary?: string;
  }): Promise<{ lead: LeadRecord }>;

  updateLead(input: {
    companyId: string;
    userId: string;
    leadId: string;
    title?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    aiSummary?: string;
    score?: number;
  }): Promise<{ lead: LeadRecord }>;

  qualifyLead(input: {
    companyId: string;
    userId: string;
    leadId: string;
    conversationId?: string | null;
    score?: number;
    /** Optional sales evidence for P1c policy enforcement. */
    evidence?: {
      productInterest?: boolean;
      statedNeed?: boolean;
      explicitBuyingIntent?: boolean;
      intendedNextStep?: string | null;
      contactAvailable?: boolean;
      companyIdentified?: boolean;
      businessUseCase?: boolean;
      purchaseTiming?: boolean;
      budgetKnown?: boolean;
      decisionAuthorityKnown?: boolean;
      notAFit?: boolean;
      conflictingSignals?: boolean;
    };
    /**
     * Server-loaded customer texts. Model arguments must not be copied into evidence.
     */
    conversationTexts?: readonly string[];
    qualificationPolicyMode?: "enforce" | "human_override";
  }): Promise<{ lead: LeadRecord; qualificationApplied?: boolean; policy?: unknown }>;

  convertLead(input: {
    companyId: string;
    userId: string;
    leadId: string;
  }): Promise<{ lead: LeadRecord; customerId: string }>;

  assignLead(input: {
    companyId: string;
    userId: string;
    leadId: string;
    assigneeUserId?: string;
    assignmentMethod?: string;
  }): Promise<{ lead: LeadRecord }>;

  searchLeads(input: {
    companyId: string;
    userId: string;
    query?: string;
    lifecycleStatus?: string;
    limit?: number;
  }): Promise<{ leads: LeadSummary[]; total: number }>;

  mergeLeads(input: {
    companyId: string;
    userId: string;
    primaryLeadId: string;
    duplicateLeadIds: string[];
  }): Promise<{ lead: LeadRecord }>;

  scoreLead(input: {
    companyId: string;
    userId: string;
    leadId: string;
    score: number;
    explanation?: string | null;
  }): Promise<{ lead: LeadRecord }>;

  /** When present, merge requires a shared phone or email. Company id comes from the server context. */
  getLead?(input: {
    companyId: string;
    userId: string;
    leadId: string;
  }): Promise<{ lead: LeadRecord | null }>;

  suggestNextAction(input: {
    companyId: string;
    userId: string;
    leadId: string;
  }): Promise<{ suggestion: string; lead: LeadRecord | null }>;
};
