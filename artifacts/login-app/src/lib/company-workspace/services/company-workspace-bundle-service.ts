import { supabase } from "@/lib/supabase";
import type {
  CompanyWorkspaceBranding,
  CompanyWorkspaceBundle,
  CompanyWorkspaceCounts,
  CompanyWorkspaceProfile,
} from "../types";

type CompanyRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  status: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
  subscription_expires_at: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  company_type: string | null;
  branding: unknown;
};

async function loadCompanyRow(companyId: string): Promise<CompanyRow | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, logo_url, status, subscription_status, billing_cycle, subscription_expires_at, contact_person, contact_email, contact_phone, company_type, branding",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CompanyRow | null) ?? null;
}

async function loadCompanyProfile(
  companyId: string,
  company: CompanyRow | null,
): Promise<CompanyWorkspaceProfile> {
  let taxId: string | null = null;
  let address: string | null = null;
  let legalName: string | null = null;

  let footerText: string | null = null;
  const billing = await supabase
    .from("company_billing_profiles")
    .select("tax_id, address, legal_name, footer_text")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!billing.error && billing.data) {
    taxId = billing.data.tax_id ? String(billing.data.tax_id) : null;
    address = billing.data.address ? String(billing.data.address) : null;
    legalName = billing.data.legal_name ? String(billing.data.legal_name) : null;
    footerText = billing.data.footer_text ? String(billing.data.footer_text) : null;
  }

  // Temporary non-column identity fields (branding.general only — no column fallbacks).
  let website: string | null = null;
  let shortName: string | null = null;
  let description: string | null = null;
  const branding =
    company?.branding && typeof company.branding === "object"
      ? (company.branding as Record<string, unknown>)
      : null;
  const general =
    branding?.general && typeof branding.general === "object"
      ? (branding.general as Record<string, unknown>)
      : null;
  if (typeof general?.website === "string" && general.website.trim()) {
    website = general.website.trim();
  }
  if (typeof general?.shortName === "string" && general.shortName.trim()) {
    shortName = general.shortName.trim();
  }
  if (typeof general?.description === "string" && general.description.trim()) {
    description = general.description.trim();
  }
  // Intentionally ignore branding.general.companyName / support* / legalName —
  // those columns are the sole source (name, contact_*, legal_name).

  return {
    id: companyId,
    name: company?.name ? String(company.name) : null,
    logoUrl: company?.logo_url ? String(company.logo_url) : null,
    status: company?.status ? String(company.status) : null,
    subscriptionStatus: company?.subscription_status
      ? String(company.subscription_status)
      : null,
    billingCycle: company?.billing_cycle ? String(company.billing_cycle) : null,
    subscriptionExpiresAt: company?.subscription_expires_at
      ? String(company.subscription_expires_at)
      : null,
    contactPerson: company?.contact_person ? String(company.contact_person) : null,
    contactEmail: company?.contact_email ? String(company.contact_email) : null,
    contactPhone: company?.contact_phone ? String(company.contact_phone) : null,
    companyType: company?.company_type ? String(company.company_type) : null,
    taxId,
    address,
    legalName,
    footerText,
    shortName,
    description,
    website,
  };
}

async function loadCounts(companyId: string): Promise<CompanyWorkspaceCounts> {
  const [employees, branches, departments] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("organization_departments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
  ]);

  if (employees.error) throw new Error(employees.error.message);
  if (branches.error) throw new Error(branches.error.message);
  if (departments.error) throw new Error(departments.error.message);

  return {
    employees: employees.count ?? 0,
    branches: branches.count ?? 0,
    departments: departments.count ?? 0,
  };
}

async function loadBranding(
  company: CompanyRow | null,
  profile: CompanyWorkspaceProfile,
): Promise<CompanyWorkspaceBranding> {
  const companyBranding =
    company?.branding && typeof company.branding === "object"
      ? (company.branding as Record<string, unknown>)
      : null;

  if (companyBranding && Object.keys(companyBranding).length > 0) {
    const logos =
      companyBranding.logos && typeof companyBranding.logos === "object"
        ? (companyBranding.logos as Record<string, unknown>)
        : {};
    const colors =
      companyBranding.colors && typeof companyBranding.colors === "object"
        ? (companyBranding.colors as Record<string, unknown>)
        : {};
    const documents =
      companyBranding.documents && typeof companyBranding.documents === "object"
        ? (companyBranding.documents as Record<string, unknown>)
        : {};

    return {
      logoUrl:
        (typeof logos.main === "string" && logos.main) ||
        (company?.logo_url ? String(company.logo_url) : null) ||
        profile.logoUrl,
      primaryColor: typeof colors.primary === "string" ? colors.primary : null,
      secondaryColor: typeof colors.secondary === "string" ? colors.secondary : null,
      invoiceLogoUrl: typeof logos.invoice === "string" ? logos.invoice : null,
      emailLogoUrl: typeof logos.email === "string" ? logos.email : null,
      watermarkUrl: typeof documents.watermarkUrl === "string" ? documents.watermarkUrl : null,
    };
  }

  let primaryColor: string | null = null;
  let secondaryColor: string | null = null;
  let invoiceLogoUrl: string | null = null;
  let emailLogoUrl: string | null = null;
  let watermarkUrl: string | null = null;

  if (!company?.id) {
    return {
      logoUrl: profile.logoUrl,
      primaryColor,
      secondaryColor,
      invoiceLogoUrl,
      emailLogoUrl,
      watermarkUrl,
    };
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("branding")
    .eq("company_id", company.id)
    .eq("is_primary", true)
    .is("deleted_at", null)
    .maybeSingle();

  const branding =
    branch?.branding && typeof branch.branding === "object"
      ? (branch.branding as Record<string, unknown>)
      : null;

  if (branding) {
    primaryColor =
      typeof branding.primaryColor === "string"
        ? branding.primaryColor
        : typeof branding.primary_color === "string"
          ? branding.primary_color
          : null;
    secondaryColor =
      typeof branding.secondaryColor === "string"
        ? branding.secondaryColor
        : typeof branding.secondary_color === "string"
          ? branding.secondary_color
          : null;
    invoiceLogoUrl =
      typeof branding.invoiceLogoUrl === "string" ? branding.invoiceLogoUrl : null;
    emailLogoUrl = typeof branding.emailLogoUrl === "string" ? branding.emailLogoUrl : null;
    watermarkUrl = typeof branding.watermarkUrl === "string" ? branding.watermarkUrl : null;
  }

  return {
    logoUrl: profile.logoUrl,
    primaryColor,
    secondaryColor,
    invoiceLogoUrl,
    emailLogoUrl,
    watermarkUrl,
  };
}

/**
 * Lightweight Company Workspace shell loader.
 * Counts only — tab lists are owned by tab-scoped hooks (no duplicate full-list fetch).
 */
export async function loadCompanyWorkspaceBundle(
  companyId: string,
): Promise<CompanyWorkspaceBundle> {
  const [company, counts] = await Promise.all([
    loadCompanyRow(companyId),
    loadCounts(companyId),
  ]);

  const profile = await loadCompanyProfile(companyId, company);
  const branding = await loadBranding(company, profile);

  return {
    companyId,
    profile,
    counts,
    branding,
  };
}
