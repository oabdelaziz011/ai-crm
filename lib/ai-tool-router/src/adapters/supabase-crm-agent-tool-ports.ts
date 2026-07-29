import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCustomerServicePort } from "@workspace/automation-platform";
import type { CrmAgentToolPorts, CrmCustomerSummary } from "../tools/crm-agent-ports.js";

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

function normalizeEmailKey(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

async function listSchedulingBookings(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from("scheduling_bookings")
    .select("id, customer_id, status, start_at, service_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("status", "eq", "rescheduled")
    .order("start_at", { ascending: true })
    .limit(200);

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

async function keywordKnowledgeFallback(client: SupabaseClient, companyId: string, query: string) {
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
      let query = client
        .from("customers")
        .select("id, name, email, phone, created_at", { count: "exact" })
        .eq("company_id", input.companyId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (input.query?.trim()) {
        const term = input.query.trim();
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      let customers = (data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));

      if (input.inactiveDays && input.inactiveDays > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - input.inactiveDays);
        const [scheduling, legacy] = await Promise.all([
          listSchedulingBookings(client, input.companyId),
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
      const result = await customerService.updateCustomer({
        companyId: input.companyId,
        userId: input.userId,
        customerId: input.customerId,
        field: input.field,
        value: input.value,
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
      const { data, error } = await client
        .from("customers")
        .select("id, name, email, phone, created_at")
        .eq("company_id", input.companyId)
        .limit(500);
      if (error) throw new Error(error.message);

      const customers = (data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));
      const groups = new Map<string, CrmCustomerSummary[]>();

      for (const customer of customers) {
        const phoneKey = normalizePhoneKey(customer.phone);
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

      if (input.duplicateCustomerIds.length === 0) {
        throw new Error("No duplicate customer IDs provided for merge.");
      }

      const primaryId = input.primaryCustomerId;
      const duplicateIds = input.duplicateCustomerIds.filter((id) => id !== primaryId);

      for (const duplicateId of duplicateIds) {
        await client
          .from("bookings")
          .update({ customer_id: primaryId })
          .eq("customer_id", duplicateId)
          .eq("company_id", input.companyId);

        await client
          .from("scheduling_bookings")
          .update({ customer_id: primaryId })
          .eq("customer_id", duplicateId)
          .eq("company_id", input.companyId);

        await client
          .from("invoices")
          .update({ customer_id: primaryId })
          .eq("customer_id", duplicateId)
          .eq("company_id", input.companyId);

        const { error: deleteError } = await client
          .from("customers")
          .delete()
          .eq("id", duplicateId)
          .eq("company_id", input.companyId);

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

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of input.rows) {
        const name = row.name?.trim();
        if (!name) {
          skipped += 1;
          errors.push("Skipped row with empty name.");
          continue;
        }

        try {
          if (row.phone?.trim()) {
            const existing = await customerService.findCustomer({
              companyId: input.companyId,
              userId: input.userId,
              lookupBy: "phone",
              lookupValue: row.phone.trim(),
            });
            if (existing.status === "found" || existing.status === "duplicate") {
              skipped += 1;
              continue;
            }
          }

          await customerService.createCustomer({
            companyId: input.companyId,
            userId: input.userId,
            name,
            phone: row.phone?.trim() || null,
            email: row.email?.trim() || null,
          });
          imported += 1;
        } catch (err) {
          skipped += 1;
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }

      return { imported, skipped, errors };
    },

    async searchInvoices(input) {
      let query = client
        .from("invoices")
        .select("id, customer_id, total_cents, status, due_at")
        .eq("company_id", input.companyId)
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
      const daysBack = input.daysBack ?? 30;
      const [scheduling, legacy] = await Promise.all([
        listSchedulingBookings(client, input.companyId),
        listLegacyBookings(client, input.userId),
      ]);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);

      const bookings = [...scheduling, ...legacy]
        .filter((b) => {
          if (input.customerId && b.customer_id !== input.customerId) return false;
          if (!b.scheduled_at) return true;
          return new Date(b.scheduled_at) >= cutoff;
        })
        .slice(0, 100);

      return { bookings, total: bookings.length };
    },

    async knowledgeSearch(input) {
      if (options.retrieveKnowledge) {
        return options.retrieveKnowledge(input);
      }
      return keywordKnowledgeFallback(client, input.companyId, input.query);
    },
  };
}
