import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCustomerServicePort } from "@workspace/automation-platform";
import type { CrmAgentToolPorts, CrmCustomerSummary } from "../tools/crm-agent-ports.js";
import { buildCustomerPhoneIdentityColumns } from "../utils/customer-phone-identity-dual-write.js";
import {
  isImportPhoneWritable,
  resolveImportPhoneIdentity,
} from "../utils/import-phone-identity.js";
import {
  companyScopedPhoneE164Lookup,
  planCustomerPhoneSearch,
  queryLooksLikePhoneSearch,
} from "../utils/customer-phone-search.js";
import { resolvePhoneIdentity } from "../utils/phone-identity-resolver.js";

export type CrmKnowledgeRetriever = (input: {
  companyId: string;
  userId: string;
  query: string;
}) => Promise<{ results: Array<{ title: string; excerpt: string; confidence: number }>; contextText: string }>;

export type CreateSupabaseCrmAgentToolPortsOptions = {
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
  getActorUserId?: () => string | null;
  retrieveKnowledge?: CrmKnowledgeRetriever;
};

function mapCustomer(row: Record<string, unknown>): CrmCustomerSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    created_at: row.created_at == null ? undefined : String(row.created_at),
  };
}

function normalizePhoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/** Prefer canonical e164 for dedup grouping; fall back to full digits (not last-9). */
function normalizeDedupPhoneKey(
  phone: string | null | undefined,
  phoneE164?: string | null,
): string | null {
  const e164 =
    (typeof phoneE164 === "string" && phoneE164.trim()) ||
    (() => {
      const r = resolvePhoneIdentity({ phone, source: "explicit" });
      return r.status === "resolved" ? r.phoneE164 : null;
    })();
  if (e164) return `e164:${e164}`;
  const digits = normalizePhoneKey(phone);
  return digits ? `digits:${digits}` : null;
}

function normalizeEmailKey(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function mergeCustomerSummaries(
  preferred: CrmCustomerSummary[],
  fallback: CrmCustomerSummary[],
): CrmCustomerSummary[] {
  const byId = new Map<string, CrmCustomerSummary>();
  for (const row of preferred) byId.set(row.id, row);
  for (const row of fallback) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function requireTrustedCompanyId(companyId: string | null | undefined): string {
  const trusted = typeof companyId === "string" ? companyId.trim() : "";
  if (!trusted) {
    throw new Error("Company context is required.");
  }
  return trusted;
}

/**
 * Prove a customer id belongs to the trusted company before any mutation.
 * Fail closed with a non-leaky message (does not reveal cross-company existence).
 */
async function assertCustomerOwnedByCompany(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
  label: string,
): Promise<void> {
  const id = typeof customerId === "string" ? customerId.trim() : "";
  if (!id) {
    throw new Error(`${label} customer id is required.`);
  }

  const { data, error } = await client
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(`${label} customer not found for this company.`);
  }
}

async function listSchedulingBookings(
  client: SupabaseClient,
  companyId: string,
  trustedCustomerId?: string | null,
) {
  let query = client
    .from("scheduling_bookings")
    .select("id, customer_id, status, start_at, service_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("status", "eq", "rescheduled")
    .order("start_at", { ascending: true })
    .limit(200);

  const trusted = typeof trustedCustomerId === "string" ? trustedCustomerId.trim() : "";
  if (trusted) {
    query = query.eq("customer_id", trusted);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    service: row.service_id ? String(row.service_id) : null,
    status: String(row.status),
    scheduled_at: row.start_at ? String(row.start_at) : null,
  }));
}

async function listLegacyBookings(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("bookings")
    .select("id, customer_id, status, booking_date, service")
    .eq("user_id", userId)
    .order("booking_date", { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    customer_id: row.customer_id ? String(row.customer_id) : null,
    service: row.service ? String(row.service) : null,
    status: String(row.status),
    scheduled_at: row.booking_date ? String(row.booking_date) : null,
  }));
}

/**
 * Legacy keyword/FTS fallback (RPC `knowledge_keyword_search`).
 * Kept for non–AI-Employee callers that explicitly need FTS.
 * AI Employee `knowledge_search` must NOT use this — inject `retrieveKnowledge` (RAG) instead.
 */
export async function keywordKnowledgeFallback(
  client: SupabaseClient,
  companyId: string,
  query: string,
) {
  const { data, error } = await client.rpc("knowledge_keyword_search", {
    p_company_id: companyId,
    p_query: query,
    p_limit: 8,
    p_source_ids: null,
    p_document_ids: null,
  });

  if (error) {
    return {
      results: [] as Array<{ title: string; excerpt: string; confidence: number }>,
      contextText: `Knowledge search unavailable: ${error.message}`,
    };
  }

  const rows = (data ?? []) as Array<{ document_title?: string; chunk_content?: string }>;
  const results = rows.map((row, index) => ({
    title: row.document_title ?? `Document ${index + 1}`,
    excerpt: (row.chunk_content ?? "").slice(0, 280),
    confidence: Math.max(0.1, 1 - index * 0.08),
  }));

  return {
    results,
    contextText:
      results.length > 0
        ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.excerpt}`).join("\n\n")
        : "No knowledge documents matched this query.",
  };
}

const KNOWLEDGE_RETRIEVER_REQUIRED_MESSAGE =
  "Knowledge retrieval is unavailable: no retrieval provider configured for this runtime.";

export function createSupabaseCrmAgentToolPorts(
  client: SupabaseClient,
  options: CreateSupabaseCrmAgentToolPortsOptions = {},
): CrmAgentToolPorts {
  const customerService = createSupabaseCustomerServicePort(client, {
    getActorUserId: options.getActorUserId,
    resolveActorUserIdForCompany: options.resolveActorUserIdForCompany,
  });

  return {
    async searchCustomers(input) {
      const companyId = requireTrustedCompanyId(input.companyId);
      let e164Customers: CrmCustomerSummary[] = [];
      const term = input.query?.trim() ?? "";

      if (term && queryLooksLikePhoneSearch(term)) {
        const plan = planCustomerPhoneSearch({ query: term, source: "explicit" });
        const scoped = companyScopedPhoneE164Lookup({
          companyId,
          phoneE164: plan.phoneE164,
        });
        if (scoped) {
          const { data: e164Data, error: e164Error } = await client
            .from("customers")
            .select("id, name, email, phone, phone_e164, created_at")
            .eq("company_id", scoped.companyId)
            .eq("phone_e164", scoped.phoneE164)
            .limit(100);
          if (e164Error) throw new Error(e164Error.message);
          e164Customers = (e164Data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));
        }
      }

      let query = client
        .from("customers")
        .select("id, name, email, phone, phone_e164, created_at", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (term) {
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      let customers = mergeCustomerSummaries(
        e164Customers,
        (data ?? []).map((row) => mapCustomer(row as Record<string, unknown>)),
      );

      if (input.inactiveDays && input.inactiveDays > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - input.inactiveDays);
        const [scheduling, legacy] = await Promise.all([
          listSchedulingBookings(client, companyId),
          listLegacyBookings(client, input.userId),
        ]);
        const activeCustomerIds = new Set(
          [...scheduling, ...legacy]
            .filter((b) => {
              if (!b.scheduled_at) return false;
              return new Date(b.scheduled_at) >= cutoff;
            })
            .map((b) => b.customer_id)
            .filter(Boolean),
        );
        customers = customers.filter((c) => !activeCustomerIds.has(c.id));
      }

      return { customers, total: input.inactiveDays ? customers.length : (count ?? customers.length) };
    },

    async updateCustomer(input) {
      const companyId = requireTrustedCompanyId(input.companyId);
      // Company-scoped CRM: LLM may choose customerId as data, but it must belong to trusted company.
      await assertCustomerOwnedByCompany(client, companyId, input.customerId, "Target");

      let phoneIdentity = undefined as ReturnType<typeof buildCustomerPhoneIdentityColumns> | undefined;
      if (input.field === "phone") {
        const preview = resolveImportPhoneIdentity({
          phone: input.value,
          rowRegion: input.region,
          source: "explicit",
        });
        if (!isImportPhoneWritable(preview) || !preview.identity) {
          if (preview.code === "phone_region_required") {
            throw new Error(
              "PHONE_REGION_REQUIRED: Provide an ISO-2 region for local phone numbers, or use E.164 (+...).",
            );
          }
          if (preview.code === "ambiguous_phone") {
            throw new Error("AMBIGUOUS_PHONE: Phone number is ambiguous; provide ISO-2 region or E.164.");
          }
          throw new Error("INVALID_PHONE: Enter a valid phone number in E.164 or local+region form.");
        }
        phoneIdentity = preview.identity;
      }

      const result = await customerService.updateCustomer({
        companyId,
        userId: input.userId,
        customerId: input.customerId.trim(),
        field: input.field,
        value: input.value,
        phoneIdentity,
      });
      return {
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          email: result.customer.email,
          phone: result.customer.phone,
        },
      };
    },

    async findDuplicateCustomers(input) {
      const companyId = requireTrustedCompanyId(input.companyId);
      const { data, error } = await client
        .from("customers")
        .select("id, name, email, phone, phone_e164, created_at")
        .eq("company_id", companyId)
        .limit(500);
      if (error) throw new Error(error.message);

      const groups = new Map<string, CrmCustomerSummary[]>();

      for (const row of data ?? []) {
        const customer = mapCustomer(row as Record<string, unknown>);
        const phoneKey = normalizeDedupPhoneKey(
          customer.phone,
          typeof (row as { phone_e164?: unknown }).phone_e164 === "string"
            ? String((row as { phone_e164: string }).phone_e164)
            : null,
        );
        if (phoneKey) {
          const key = `phone:${phoneKey}`;
          groups.set(key, [...(groups.get(key) ?? []), customer]);
        }
        const emailKey = normalizeEmailKey(customer.email);
        if (emailKey) {
          const key = `email:${emailKey}`;
          groups.set(key, [...(groups.get(key) ?? []), customer]);
        }
      }

      const duplicateGroups = [...groups.entries()]
        .filter(([, members]) => members.length > 1)
        .map(([key, members]) => ({ key, customers: members }));

      return { groups: duplicateGroups };
    },

    async mergeCustomers(input) {
      if (!input.confirmed) {
        return {
          merged: false,
          primaryCustomerId: input.primaryCustomerId,
          mergedCount: 0,
          message: "Merge requires explicit confirmation.",
        };
      }

      const companyId = requireTrustedCompanyId(input.companyId);

      if (input.duplicateCustomerIds.length === 0) {
        throw new Error("No duplicate customer IDs provided for merge.");
      }

      const primaryId = String(input.primaryCustomerId ?? "").trim();
      const duplicateIds = [
        ...new Set(
          input.duplicateCustomerIds
            .map((id) => String(id ?? "").trim())
            .filter((id) => id && id !== primaryId),
        ),
      ];

      if (!primaryId) {
        throw new Error("Primary customer id is required.");
      }
      if (duplicateIds.length === 0) {
        throw new Error("No duplicate customer IDs provided for merge.");
      }

      // Ownership validation MUST complete before any reassignment/deletion.
      await assertCustomerOwnedByCompany(client, companyId, primaryId, "Primary");
      for (const duplicateId of duplicateIds) {
        await assertCustomerOwnedByCompany(client, companyId, duplicateId, "Duplicate");
      }

      for (const duplicateId of duplicateIds) {
        await client
          .from("bookings")
          .update({ customer_id: primaryId })
          .eq("customer_id", duplicateId)
          .eq("company_id", companyId);

        await client
          .from("scheduling_bookings")
          .update({ customer_id: primaryId })
          .eq("customer_id", duplicateId)
          .eq("company_id", companyId);

        await client
          .from("invoices")
          .update({ customer_id: primaryId })
          .eq("customer_id", duplicateId)
          .eq("company_id", companyId);

        const { error: deleteError } = await client
          .from("customers")
          .delete()
          .eq("id", duplicateId)
          .eq("company_id", companyId);

        if (deleteError) throw new Error(deleteError.message);
      }

      return {
        merged: true,
        primaryCustomerId: primaryId,
        mergedCount: duplicateIds.length,
        message: `Merged ${duplicateIds.length} duplicate customer record(s) into ${primaryId}.`,
      };
    },

    async importCustomers(input) {
      if (!input.confirmed) {
        return { imported: 0, skipped: 0, errors: ["Import requires explicit confirmation."] };
      }

      const companyId = requireTrustedCompanyId(input.companyId);

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const rowResults: Array<{
        index: number;
        status: "imported" | "skipped" | "duplicate" | "manual_review" | "invalid";
        code?: string;
        phoneE164?: string | null;
      }> = [];

      for (let index = 0; index < input.rows.length; index += 1) {
        const row = input.rows[index]!;
        const name = row.name?.trim();
        if (!name) {
          skipped += 1;
          errors.push(`Row ${index}: skipped empty name.`);
          rowResults.push({ index, status: "skipped", code: "empty_name" });
          continue;
        }

        try {
          const phone = row.phone?.trim() || null;
          const preview = resolveImportPhoneIdentity({
            phone,
            rowRegion: row.region ?? row.country ?? row.phone_country_iso,
            defaultRegion: input.defaultRegion,
            source: "import",
          });

          if (phone && !isImportPhoneWritable(preview)) {
            skipped += 1;
            const code = preview.code;
            errors.push(`Row ${index}: ${code} (${phone})`);
            rowResults.push({
              index,
              status:
                code === "phone_region_required" || code === "phone_identity_unresolved"
                  ? "manual_review"
                  : "invalid",
              code,
              phoneE164: null,
            });
            continue;
          }

          if (preview.phoneE164) {
            const existingE164 = await customerService.findCustomer({
              companyId,
              userId: input.userId,
              lookupBy: "phone_e164",
              lookupValue: preview.phoneE164,
            });
            if (existingE164.status === "found" || existingE164.status === "duplicate") {
              skipped += 1;
              rowResults.push({
                index,
                status: "duplicate",
                code: "duplicate_phone",
                phoneE164: preview.phoneE164,
              });
              continue;
            }
          } else if (phone) {
            const existing = await customerService.findCustomer({
              companyId,
              userId: input.userId,
              lookupBy: "phone",
              lookupValue: phone,
            });
            if (existing.status === "found" || existing.status === "duplicate") {
              skipped += 1;
              rowResults.push({ index, status: "duplicate", code: "duplicate_phone" });
              continue;
            }
          }

          await customerService.createCustomer({
            companyId,
            userId: input.userId,
            name,
            phone,
            email: row.email?.trim() || null,
            phoneIdentity: preview.identity ?? buildCustomerPhoneIdentityColumns({ phone: null }),
          });
          imported += 1;
          rowResults.push({
            index,
            status: "imported",
            code: preview.code,
            phoneE164: preview.phoneE164,
          });
        } catch (err) {
          skipped += 1;
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Row ${index}: ${message}`);
          rowResults.push({
            index,
            status: /phone_e164|duplicate/i.test(message) ? "duplicate" : "invalid",
            code: /phone_e164|duplicate/i.test(message) ? "duplicate_phone" : "write_error",
          });
        }
      }

      return { imported, skipped, errors, rowResults };
    },

    async searchInvoices(input) {
      const trusted =
        typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
      if (!trusted) {
        return {
          invoices: [],
          total: 0,
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message:
            "Trusted customer context is required before searching invoices for this conversation.",
        };
      }

      let query = client
        .from("invoices")
        .select("id, customer_id, total_cents, status, due_at")
        .eq("company_id", input.companyId)
        .eq("customer_id", trusted)
        .eq("invoice_type", "customer")
        .order("due_at", { ascending: true })
        .limit(100);

      if (input.status) {
        query = query.eq("status", input.status);
      }

      if (input.overdueOnly) {
        const now = new Date().toISOString();
        query = query.in("status", ["issued", "partially_paid", "pending"]).lt("due_at", now);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const invoices = (data ?? []).map((row) => ({
        id: String(row.id),
        customer_id: row.customer_id ? String(row.customer_id) : null,
        amount: Number(row.total_cents ?? 0) / 100,
        status: String(row.status),
        due_date: row.due_at ? String(row.due_at) : null,
      }));

      return { invoices, total: invoices.length };
    },

    async searchBookings(input) {
      const trusted =
        typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
      if (!trusted) {
        return {
          bookings: [],
          total: 0,
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message:
            "Trusted customer context is required before searching bookings for this conversation.",
        };
      }

      // Ignore LLM customerId — trustedCustomerId only (Phase 5D).
      const daysBack = input.daysBack ?? 30;
      const [scheduling, legacy] = await Promise.all([
        listSchedulingBookings(client, input.companyId, trusted),
        listLegacyBookings(client, input.userId),
      ]);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);

      const bookings = [...scheduling, ...legacy]
        .filter((b) => b.customer_id === trusted)
        .filter((b) => {
          if (!b.scheduled_at) return true;
          return new Date(b.scheduled_at) >= cutoff;
        })
        .slice(0, 100);

      return { bookings, total: bookings.length };
    },

    async knowledgeSearch(input) {
      const companyId = requireTrustedCompanyId(input.companyId);
      if (!options.retrieveKnowledge) {
        return {
          results: [],
          contextText: KNOWLEDGE_RETRIEVER_REQUIRED_MESSAGE,
        };
      }
      return options.retrieveKnowledge({
        companyId,
        userId: input.userId,
        query: input.query,
      });
    },
  };
}
