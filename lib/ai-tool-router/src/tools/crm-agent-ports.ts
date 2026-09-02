export type CrmCustomerSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at?: string;
};

export type CrmSearchCustomersResult = {
  customers: CrmCustomerSummary[];
  total: number;
};

export type CrmInvoiceSummary = {
  id: string;
  customer_id: string | null;
  amount: number;
  status: string;
  due_date: string | null;
};

export type CrmBookingSummary = {
  id: string;
  customer_id: string | null;
  service: string | null;
  status: string;
  scheduled_at: string | null;
};

/** CRM agent tool ports — injected by login-app to avoid cross-package coupling. */
export type CrmAgentToolPorts = {
  searchCustomers(input: {
    companyId: string;
    userId: string;
    query?: string;
    inactiveDays?: number;
  }): Promise<CrmSearchCustomersResult>;

  updateCustomer(input: {
    companyId: string;
    userId: string;
    customerId: string;
    field: string;
    value: string;
    /** ISO-2 when field is phone and value is local/national. Never company country. */
    region?: string | null;
  }): Promise<{ customer: CrmCustomerSummary }>;

  findDuplicateCustomers(input: {
    companyId: string;
    userId: string;
  }): Promise<{ groups: Array<{ key: string; customers: CrmCustomerSummary[] }> }>;

  mergeCustomers(input: {
    companyId: string;
    userId: string;
    primaryCustomerId: string;
    duplicateCustomerIds: string[];
    confirmed: boolean;
  }): Promise<{ merged: boolean; primaryCustomerId: string; mergedCount: number; message: string }>;

  importCustomers(input: {
    companyId: string;
    userId: string;
    rows: Array<{
      name: string;
      phone?: string;
      email?: string;
      /** Per-row ISO-2 override. */
      region?: string | null;
      country?: string | null;
      phone_country_iso?: string | null;
    }>;
    /** Explicit operator-selected default ISO-2 for local numbers. Never inferred. */
    defaultRegion?: string | null;
    confirmed: boolean;
  }): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
    /** Optional per-row outcomes for operator review. */
    rowResults?: Array<{
      index: number;
      status: "imported" | "skipped" | "duplicate" | "manual_review" | "invalid";
      code?: string;
      phoneE164?: string | null;
    }>;
  }>;

  searchInvoices(input: {
    companyId: string;
    userId: string;
    /**
     * Trusted conversation customer only — never LLM-supplied.
     * Required for AI Employee channel execution; ports fail closed when absent.
     */
    trustedCustomerId?: string | null;
    status?: string;
    overdueOnly?: boolean;
  }): Promise<{ invoices: CrmInvoiceSummary[]; total: number; errors?: string[]; message?: string }>;

  searchBookings(input: {
    companyId: string;
    userId: string;
    /**
     * Trusted conversation customer only — never LLM-supplied.
     * Required for AI Employee channel execution; ports fail closed when absent.
     */
    trustedCustomerId?: string | null;
    /** @deprecated Ignored for authorization — use trustedCustomerId only. */
    customerId?: string;
    daysBack?: number;
  }): Promise<{ bookings: CrmBookingSummary[]; total: number; errors?: string[]; message?: string }>;

  knowledgeSearch(input: {
    companyId: string;
    userId: string;
    query: string;
  }): Promise<{ results: Array<{ title: string; excerpt: string; confidence: number }>; contextText: string }>;
};
