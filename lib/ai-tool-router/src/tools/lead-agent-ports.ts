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
    score?: number;
  }): Promise<{ lead: LeadRecord }>;

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
  }): Promise<{ lead: LeadRecord }>;

  suggestNextAction(input: {
    companyId: string;
    userId: string;
    leadId: string;
  }): Promise<{ suggestion: string; lead: LeadRecord | null }>;
};
