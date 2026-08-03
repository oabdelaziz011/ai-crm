export type IdentityKind = "unknown" | "lead" | "customer";

export type ResolvedIdentity = {
  kind: IdentityKind;
  customerId?: string | null;
  leadId?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type IdentityResolutionInput = {
  companyId: string;
  actorUserId: string;
  conversationId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type CreateLeadForUnknownInput = {
  companyId: string;
  actorUserId: string;
  conversationId: string;
  title: string;
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  aiSummary?: string;
  metadata?: Record<string, unknown>;
};
