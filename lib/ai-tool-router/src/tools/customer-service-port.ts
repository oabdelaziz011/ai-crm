export type ToolCustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type ToolFindCustomerResult =
  | { status: "not_found"; count: 0 }
  | { status: "found"; count: 1; customer: ToolCustomerRecord }
  | { status: "duplicate"; count: number };

/** Minimal CRM port injected by login-app — keeps ai-tool-router free of automation-platform coupling. */
export type ToolCustomerServicePort = {
  findCustomer(input: {
    companyId: string;
    userId: string;
    lookupBy: "phone" | "email";
    lookupValue: string;
  }): Promise<ToolFindCustomerResult>;
  createCustomer(input: {
    companyId: string;
    userId: string;
    name: string;
    phone: string;
    email?: string | null;
  }): Promise<{ customer: ToolCustomerRecord }>;
};
