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
    rows: Array<{ name: string; phone?: string; email?: string }>;
    confirmed: boolean;
  }): Promise<{ imported: number; skipped: number; errors: string[] }>;

  searchInvoices(input: {
    companyId: string;
    userId: string;
    status?: string;
    overdueOnly?: boolean;
  }): Promise<{ invoices: CrmInvoiceSummary[]; total: number }>;

  searchBookings(input: {
    companyId: string;
    userId: string;
    customerId?: string;
    daysBack?: number;
  }): Promise<{ bookings: CrmBookingSummary[]; total: number }>;

  knowledgeSearch(input: {
    companyId: string;
    userId: string;
    query: string;
  }): Promise<{ results: Array<{ title: string; excerpt: string; confidence: number }>; contextText: string }>;
};
