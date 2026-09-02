import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PortalAuthChallenge,
  PortalCustomerInput,
  PortalSession,
} from "@/lib/customer-portal/types";
import type { PortalAuthMethod } from "@/lib/customer-portal/types/portal-enums";
import {
  planCustomerPhoneSearch,
  companyScopedPhoneE164Lookup,
  resolveImportPhoneIdentity,
  isImportPhoneWritable,
  buildCustomerPhoneIdentityColumns,
} from "@workspace/ai-tool-router";

export class PortalAuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async startChallenge(input: {
    companyId: string;
    method: PortalAuthMethod;
    destination: string;
  }): Promise<PortalAuthChallenge> {
    const { data, error } = await this.client.rpc("portal_start_auth_challenge", {
      p_company_id: input.companyId,
      p_method: input.method,
      p_destination: input.destination,
    });
    if (error) throw new Error(error.message);
    const row = data as Record<string, string>;
    return {
      challengeId: row.challenge_id,
      method: input.method,
      expiresAt: row.expires_at,
      maskedDestination: row.masked_destination,
    };
  }

  async verifyChallenge(input: {
    challengeId: string;
    code: string;
  }): Promise<PortalSession> {
    const { data, error } = await this.client.rpc("portal_verify_auth_challenge", {
      p_challenge_id: input.challengeId,
      p_code: input.code,
    });
    if (error) throw new Error(error.message);
    const row = data as Record<string, string>;
    return {
      id: row.session_id,
      customerId: row.customer_id,
      companyId: row.company_id,
      status: "active",
      expiresAt: row.expires_at,
      token: row.token,
    };
  }

  async resolveCustomerByPhone(
    companyId: string,
    phone: string,
  ): Promise<{ customerId: string; exists: boolean } | null> {
    const company = companyId.trim();
    const rawPhone = phone.trim();
    if (!company || !rawPhone) return null;

    // Phase D3 — company-scoped phone_e164 when safely resolvable (no OTP change).
    const plan = planCustomerPhoneSearch({ query: rawPhone, source: "explicit" });
    const scoped = companyScopedPhoneE164Lookup({
      companyId: company,
      phoneE164: plan.phoneE164,
    });
    if (scoped) {
      const { data: e164Row, error: e164Error } = await this.client
        .from("customers")
        .select("id")
        .eq("company_id", scoped.companyId)
        .eq("phone_e164", scoped.phoneE164)
        .maybeSingle();
      if (e164Error) throw new Error(e164Error.message);
      if (e164Row?.id) {
        return { customerId: String(e164Row.id), exists: true };
      }
    }

    // Legacy exact phone RPC (tenant-scoped). Preserves OTP / challenge isolation.
    const { data, error } = await this.client.rpc("portal_resolve_customer_by_phone", {
      p_company_id: company,
      p_phone: rawPhone,
    });
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { customerId: String(row.customer_id), exists: Boolean(row.exists) };
  }

  async upsertCustomer(
    companyId: string,
    customer: PortalCustomerInput,
    ownerUserId?: string | null,
  ): Promise<string> {
    // Resolve identity before RPC so create is atomic (phone + identity in one INSERT).
    // No company-country guess — E.164 / explicit region resolve; local without region → unresolved.
    const preview = resolveImportPhoneIdentity({
      phone: customer.phone,
      rowRegion: customer.phoneRegion ?? null,
      source: "explicit",
    });
    const identity =
      preview.identity ??
      (isImportPhoneWritable(preview)
        ? buildCustomerPhoneIdentityColumns({ phone: null })
        : buildCustomerPhoneIdentityColumns({
            phone: customer.phone,
            region: customer.phoneRegion ?? null,
          }));

    const { data, error } = await this.client.rpc("portal_upsert_customer", {
      p_company_id: companyId,
      p_name: customer.name,
      p_email: customer.email ?? null,
      p_phone: customer.phone,
      p_owner_user_id: ownerUserId ?? null,
      p_preferred_language: customer.preferredLanguage ?? "en",
      p_marketing_consent: customer.marketingConsent ?? false,
      p_phone_e164: identity.phone_e164,
      p_phone_country_iso: identity.phone_country_iso,
      p_phone_region_source: identity.phone_region_source,
      p_phone_national: identity.phone_national,
    });
    if (error) throw new Error(error.message);
    return String(data);
  }
}
