import { useQuery } from "@tanstack/react-query";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";

export type BrandLastUpdated = {
  updatedAt: string;
  actorName: string | null;
  /** Health item labelKeys or free-form field hints from audit metadata. */
  fieldKeys: string[];
};

/**
 * Best-effort last branding update from companies.updated_at + audit_logs.
 * Returns null when unavailable — UI must hide the card.
 */
export function useBrandLastUpdated(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["company-brand-last-updated", companyId] as const,
    enabled: Boolean(enabled && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<BrandLastUpdated | null> => {
      if (!companyId) return null;

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("updated_at")
        .eq("id", companyId)
        .maybeSingle();

      if (companyError || !company?.updated_at) return null;

      let actorName: string | null = null;
      let fieldKeys: string[] = [];
      let updatedAt = String(company.updated_at);

      const { data: auditRows, error: auditError } = await supabase
        .from("audit_logs")
        .select("created_at, user_id, metadata, action, entity")
        .eq("company_id", companyId)
        .eq("entity", "companies")
        .order("created_at", { ascending: false })
        .limit(8);

      if (!auditError && auditRows?.length) {
        const brandingAudit = auditRows.find((row) => {
          const meta = row.metadata;
          if (!meta || typeof meta !== "object") return false;
          const record = meta as Record<string, unknown>;
          return (
            "branding" in record ||
            "logo_url" in record ||
            String(row.action ?? "").toLowerCase().includes("brand")
          );
        });

        const chosen = brandingAudit ?? auditRows[0]!;
        if (chosen.created_at) updatedAt = String(chosen.created_at);

        fieldKeys = extractFieldKeys(chosen.metadata);

        if (chosen.user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", chosen.user_id)
            .maybeSingle();
          actorName =
            (profile?.full_name && String(profile.full_name).trim()) ||
            (profile?.email && String(profile.email).trim()) ||
            null;
        }
      }

      return { updatedAt, actorName, fieldKeys };
    },
  });
}

function extractFieldKeys(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;
  const keys: string[] = [];

  const branding = record.branding;
  if (branding && typeof branding === "object") {
    const b = branding as Record<string, unknown>;
    if (b.colors && typeof b.colors === "object") {
      const colors = b.colors as Record<string, unknown>;
      if ("primary" in colors) keys.push("primaryColor");
      if ("secondary" in colors) keys.push("secondaryColor");
    }
    if (b.logos && typeof b.logos === "object") {
      const logos = b.logos as Record<string, unknown>;
      if ("main" in logos) keys.push("primaryLogo");
      if ("dark" in logos) keys.push("darkLogo");
      if ("invoice" in logos) keys.push("invoiceLogo");
      if ("email" in logos) keys.push("emailLogo");
      if ("square" in logos) keys.push("squareLogo");
    }
    if (b.email && typeof b.email === "object") {
      const email = b.email as Record<string, unknown>;
      if ("legalText" in email || "footer" in email) keys.push("emailFooter");
      if ("senderName" in email || "senderDisplayName" in email) keys.push("senderIdentity");
    }
  }

  if ("logo_url" in record) keys.push("primaryLogo");
  return [...new Set(keys)].slice(0, 6);
}
