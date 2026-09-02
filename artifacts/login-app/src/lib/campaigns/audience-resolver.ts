import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CampaignAudienceCustomer,
  CampaignAudienceDefinition,
  CampaignAudienceFilterDefinition,
  CampaignAudienceResolveResult,
} from "./types";
import { MarketingCampaignError } from "./types";

/** Live public.customers has no soft-delete column; do not select/filter one. */
const CUSTOMER_SELECT =
  "id, company_id, name, phone, phone_e164, email, age, gender, created_at";

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
};

function mapCustomer(row: CustomerRow): CampaignAudienceCustomer {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    phone: row.phone,
    phoneE164: row.phone_e164 ?? null,
    email: row.email,
    age: row.age,
    gender: row.gender,
    createdAt: row.created_at,
  };
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesServerSafeFilter(
  row: CustomerRow,
  filters: CampaignAudienceFilterDefinition,
): boolean {
  const search = normalizeSearch(filters.search);
  if (search) {
    const haystack = [
      row.name,
      row.email ?? "",
      row.phone ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (filters.gender && filters.gender !== "all") {
    if ((row.gender ?? "").toLowerCase() !== filters.gender.toLowerCase()) return false;
  }

  if (filters.ageMin != null && (row.age == null || row.age < filters.ageMin)) return false;
  if (filters.ageMax != null && (row.age == null || row.age > filters.ageMax)) return false;

  if (filters.registeredFrom) {
    if (row.created_at < filters.registeredFrom) return false;
  }
  if (filters.registeredTo) {
    // Inclusive end-of-day style: compare date prefix when only a date is supplied.
    const to = filters.registeredTo.length <= 10
      ? `${filters.registeredTo}T23:59:59.999Z`
      : filters.registeredTo;
    if (row.created_at > to) return false;
  }

  return true;
}

/**
 * Server-side audience resolver.
 * Never trusts browser-supplied customer IDs without revalidation.
 * Marketing eligibility: receive_marketing must be true (default false when no prefs row).
 */
export class CampaignAudienceResolver {
  constructor(private readonly client: SupabaseClient) {}

  async resolve(
    companyId: string,
    audience: CampaignAudienceDefinition,
  ): Promise<CampaignAudienceResolveResult> {
    if (!companyId) {
      throw new MarketingCampaignError("company_id is required", "invalid_input");
    }

    let candidates: CustomerRow[] = [];
    let excludedOtherCompanyCount = 0;
    let excludedMissingCount = 0;

    if (audience.type === "manual") {
      const uniqueIds = [...new Set(audience.customerIds.map((id) => id.trim()).filter(Boolean))];
      if (uniqueIds.length === 0) {
        return {
          customers: [],
          recipientCount: 0,
          excludedOptedOutCount: 0,
          excludedOtherCompanyCount: 0,
          excludedMissingCount: 0,
        };
      }

      const { data, error } = await this.client
        .from("customers")
        .select(CUSTOMER_SELECT)
        .in("id", uniqueIds);
      if (error) throw new Error(error.message);

      const found = new Map((data as CustomerRow[] | null)?.map((row) => [row.id, row]) ?? []);
      for (const id of uniqueIds) {
        const row = found.get(id);
        if (!row) {
          excludedMissingCount += 1;
          continue;
        }
        if (row.company_id !== companyId) {
          excludedOtherCompanyCount += 1;
          continue;
        }
        candidates.push(row);
      }
    } else {
      const { data, error } = await this.client
        .from("customers")
        .select(CUSTOMER_SELECT)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      candidates = (data as CustomerRow[] | null) ?? [];

      if (audience.type === "filtered") {
        candidates = candidates.filter((row) => matchesServerSafeFilter(row, audience.filters));
      }
    }

    const eligibleIds = await this.filterMarketingEligible(
      companyId,
      candidates.map((c) => c.id),
    );
    const optedOut = candidates.length - eligibleIds.size;
    const customers = candidates
      .filter((c) => eligibleIds.has(c.id))
      .map(mapCustomer)
      .sort((a, b) => a.id.localeCompare(b.id));

    return {
      customers,
      recipientCount: customers.length,
      excludedOptedOutCount: optedOut,
      excludedOtherCompanyCount,
      excludedMissingCount,
    };
  }

  /**
   * Prefer receive_marketing = true. Missing preference rows default to opted out
   * (matches CommunicationPreferenceService / CustomerCommunicationPreferencesRepository).
   */
  private async filterMarketingEligible(
    companyId: string,
    customerIds: string[],
  ): Promise<Set<string>> {
    if (customerIds.length === 0) return new Set();

    const { data, error } = await this.client
      .from("customer_communication_preferences")
      .select("customer_id, receive_marketing")
      .eq("company_id", companyId)
      .in("customer_id", customerIds)
      .eq("receive_marketing", true);

    if (error) throw new Error(error.message);

    return new Set(
      ((data as Array<{ customer_id: string }> | null) ?? []).map((row) => row.customer_id),
    );
  }
}
