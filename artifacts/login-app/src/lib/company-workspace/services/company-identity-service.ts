import { supabase } from "@/lib/supabase";
import { companyIdentityFromRows } from "@/lib/company-workspace/company-identity/resolve-company-identity";
import type { CompanyIdentity } from "@/lib/company-workspace/company-identity/types";

export type CompanyIdentityLoadResult = {
  identity: CompanyIdentity;
  brandingRaw: unknown;
};

/**
 * Load company identity from companies + company_billing_profiles only.
 * Branding colors/logos/shortName/website/description come from companies.branding JSON.
 */
export async function loadCompanyIdentityBundle(
  companyId: string,
): Promise<CompanyIdentityLoadResult> {
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, logo_url, contact_email, contact_phone, branding")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!company) throw new Error("Company not found");

  const { data: billing } = await supabase
    .from("company_billing_profiles")
    .select("legal_name, tax_id, address, footer_text, logo_url")
    .eq("company_id", companyId)
    .maybeSingle();

  const identity = companyIdentityFromRows({
    companyId,
    name: company.name ? String(company.name) : null,
    logoUrl: company.logo_url
      ? String(company.logo_url)
      : billing?.logo_url
        ? String(billing.logo_url)
        : null,
    contactEmail: company.contact_email ? String(company.contact_email) : null,
    contactPhone: company.contact_phone ? String(company.contact_phone) : null,
    brandingRaw: company.branding,
    legalName: billing?.legal_name ? String(billing.legal_name) : null,
    taxId: billing?.tax_id ? String(billing.tax_id) : null,
    address: billing?.address ? String(billing.address) : null,
    footerText: billing?.footer_text ? String(billing.footer_text) : null,
  });

  return { identity, brandingRaw: company.branding };
}

export async function loadCompanyIdentity(companyId: string): Promise<CompanyIdentity> {
  const { identity } = await loadCompanyIdentityBundle(companyId);
  return identity;
}

export type { CompanyIdentity };
