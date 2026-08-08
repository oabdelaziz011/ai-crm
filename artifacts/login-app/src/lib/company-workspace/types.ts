export type CompanyWorkspaceTabId =
  | "overview"
  | "employees"
  | "branches"
  | "departments"
  | "branding"
  | "subscription";

export type CompanyWorkspaceProfile = Readonly<{
  id: string;
  name: string | null;
  logoUrl: string | null;
  status: string | null;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  subscriptionExpiresAt: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyType: string | null;
  /** From billing profile when available */
  taxId: string | null;
  address: string | null;
  legalName: string | null;
  footerText: string | null;
  /** Temporary: companies.branding.general until Identity Schema Normalization sprint. */
  shortName: string | null;
  description: string | null;
  website: string | null;
}>;

export type CompanyWorkspaceCounts = Readonly<{
  employees: number;
  branches: number;
  departments: number;
}>;

export type CompanyWorkspaceBranding = Readonly<{
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  invoiceLogoUrl: string | null;
  emailLogoUrl: string | null;
  watermarkUrl: string | null;
}>;

/** Shell bundle — profile/counts/branding only. Tab lists use their own hooks. */
export type CompanyWorkspaceBundle = Readonly<{
  companyId: string;
  profile: CompanyWorkspaceProfile;
  counts: CompanyWorkspaceCounts;
  branding: CompanyWorkspaceBranding;
}>;
