import { supabase } from "@/lib/supabase";
import {
  normalizeBrandCenterDocument,
  toPersistedBrandingPayload,
} from "@/lib/company-workspace/brand-center/normalize";
import type { CompanyBrandCenterDocument } from "@/lib/company-workspace/brand-center/types";

function isMissingRpcError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("save_company_brand_center") ||
    normalized.includes("could not find the function") ||
    normalized.includes("schema cache") ||
    normalized.includes("pgrst202") ||
    normalized.includes("42883") ||
    (/function/.test(normalized) && /does not exist/.test(normalized))
  );
}

export async function loadCompanyBrandCenter(
  companyId: string,
): Promise<CompanyBrandCenterDocument> {
  const { loadCompanyIdentityBundle } = await import(
    "@/lib/company-workspace/services/company-identity-service"
  );
  const { identity, brandingRaw } = await loadCompanyIdentityBundle(companyId);

  const branchResult = await supabase
    .from("branches")
    .select("branding")
    .eq("company_id", companyId)
    .eq("is_primary", true)
    .is("deleted_at", null)
    .maybeSingle();

  const branchBranding =
    branchResult.data?.branding && typeof branchResult.data.branding === "object"
      ? (branchResult.data.branding as Record<string, unknown>)
      : null;

  return normalizeBrandCenterDocument({
    brandingRaw,
    logoUrl: identity.logoUrl,
    companyName: identity.name,
    legalName: identity.legalName,
    supportEmail: identity.contactEmail,
    supportPhone: identity.contactPhone,
    invoiceFooter: identity.footerText,
    branchBranding,
  });
}

async function saveCompanyBrandCenterFallback(
  companyId: string,
  document: CompanyBrandCenterDocument,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error: updateError } = await supabase
    .from("companies")
    .update({
      branding: payload,
      logo_url: document.logos.main,
      name: document.general.companyName || undefined,
      contact_email: document.general.supportEmail || null,
      contact_phone: document.general.supportPhone || null,
    })
    .eq("id", companyId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Best-effort billing footer/legal sync (non-fatal if RLS blocks).
  const { error: billingError } = await supabase.from("company_billing_profiles").upsert(
    {
      company_id: companyId,
      legal_name: document.general.legalName || null,
      logo_url: document.logos.main,
      footer_text: document.documents.invoiceFooter || null,
    },
    { onConflict: "company_id" },
  );
  if (billingError) {
    console.warn("[BrandCenter] billing profile sync skipped:", billingError.message);
  }
}

export async function saveCompanyBrandCenter(
  companyId: string,
  document: CompanyBrandCenterDocument,
): Promise<CompanyBrandCenterDocument> {
  const payload = toPersistedBrandingPayload(document);

  const { data, error } = await supabase.rpc("save_company_brand_center", {
    p_company_id: companyId,
    p_branding: payload,
    p_logo_url: document.logos.main,
    p_company_name: document.general.companyName || null,
    p_legal_name: document.general.legalName || null,
    p_support_email: document.general.supportEmail,
    p_support_phone: document.general.supportPhone,
    p_invoice_footer: document.documents.invoiceFooter || null,
  });

  if (error) {
    console.error("[BrandCenter] RPC save_company_brand_center failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    if (isMissingRpcError(error.message) || error.code === "PGRST202" || error.code === "42883") {
      await saveCompanyBrandCenterFallback(companyId, document, payload);
      return document;
    }

    throw new Error(error.message || error.details || "Brand save failed");
  }

  if (data && typeof data === "object") {
    // Re-normalize from RPC return so UI baseline matches persisted JSON.
    return normalizeBrandCenterDocument({
      brandingRaw: data,
      logoUrl: document.logos.main,
      companyName: document.general.companyName,
      legalName: document.general.legalName,
      supportEmail: document.general.supportEmail,
      supportPhone: document.general.supportPhone,
      invoiceFooter: document.documents.invoiceFooter,
      branchBranding: null,
    });
  }

  return document;
}
