import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PortalAuthChallenge,
  PortalCustomerInput,
  PortalSession,
} from "@/lib/customer-portal/types";
import type { PortalAuthMethod } from "@/lib/customer-portal/types/portal-enums";

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
    const { data, error } = await this.client.rpc("portal_resolve_customer_by_phone", {
      p_company_id: companyId,
      p_phone: phone,
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
    const { data, error } = await this.client.rpc("portal_upsert_customer", {
      p_company_id: companyId,
      p_name: customer.name,
      p_email: customer.email ?? null,
      p_phone: customer.phone,
      p_owner_user_id: ownerUserId ?? null,
      p_preferred_language: customer.preferredLanguage ?? "en",
      p_marketing_consent: customer.marketingConsent ?? false,
    });
    if (error) throw new Error(error.message);
    return String(data);
  }
}
