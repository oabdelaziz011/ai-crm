import type {
  CrmAgentToolPorts,
  CrmCustomerSummary,
  CrmKnowledgeRetriever,
} from "@workspace/ai-tool-router";
import {
  buildCustomerPhoneIdentityColumns,
  isImportPhoneWritable,
  planCustomerPhoneSearch,
  resolveImportPhoneIdentity,
  resolvePhoneIdentity,
} from "@workspace/ai-tool-router";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { createLoginAppApplicationPorts } from "./create-login-app-application-ports.js";
import { supabase } from "@/lib/supabase";

function mapCustomer(row: {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  createdAt?: string;
}): CrmCustomerSummary {
  return {
    id: row.id,
    name: row.displayName,
    email: row.email ?? null,
    phone: row.phone ?? null,
    created_at: row.createdAt,
  };
}

function normalizePhoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function normalizeDedupPhoneKey(phone: string | null | undefined): string | null {
  const plan = planCustomerPhoneSearch({ query: phone ?? "", source: "explicit" });
  if (plan.phoneE164) return `e164:${plan.phoneE164}`;
  const resolved = resolvePhoneIdentity({ phone, source: "explicit" });
  if (resolved.status === "resolved") return `e164:${resolved.phoneE164}`;
  const digits = normalizePhoneKey(phone);
  return digits ? `digits:${digits}` : null;
}

function normalizeEmailKey(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export type CreateApplicationLayerCrmAgentToolPortsOptions = {
  portContext: LoginAppPortContext;
  /** Phase 5K.1 — RAG via shared KnowledgeRuntimeProvider path. */
  retrieveKnowledge?: CrmKnowledgeRetriever;
};

/** CRM agent ports backed by Application Layer read/write ports — no direct Supabase for domain reads. */
export function createApplicationLayerCrmAgentToolPorts(
  options: CreateApplicationLayerCrmAgentToolPortsOptions,
): CrmAgentToolPorts {
  const { portContext, retrieveKnowledge } = options;
  const ports = createLoginAppApplicationPorts(portContext, supabase);
  const tenantId = portContext.companyId;

  return {
    async searchCustomers(input) {
      const query = input.query?.trim() ?? "";
      const customers = query
        ? await ports.customerRead.search(tenantId, query, 100)
        : (await ports.globalSearchRead.search(tenantId, query || " ", 100))
            .filter((item) => item.type === "customer")
            .map((item) => ({
              id: item.id,
              tenantId,
              displayName: item.title,
              email: item.subtitle.includes("@") ? item.subtitle : null,
              phone: item.preview ?? null,
              createdAt: new Date().toISOString(),
            }));

      let mapped = customers.map(mapCustomer);

      if (input.inactiveDays && input.inactiveDays > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - input.inactiveDays);
        const bookings = await ports.bookingRead.listQueue(tenantId, { pageSize: 500 });
        const activeCustomerIds = new Set(
          bookings
            .filter((b) => new Date(b.scheduledAt) >= cutoff)
            .map((b) => b.customerId),
        );
        mapped = mapped.filter((c) => !activeCustomerIds.has(c.id));
      }

      return { customers: mapped, total: mapped.length };
    },

    async updateCustomer(input) {
      // Company-scoped CRM: trusted tenant from port context; LLM customerId is data only.
      if (input.companyId !== tenantId) {
        throw new Error("Company context mismatch.");
      }

      const patch: Record<string, unknown> = {
        [input.field]: input.value,
      };
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
        patch.phoneIdentity = preview.identity;
        if (input.region) patch.phoneRegion = input.region;
      }

      const updated = await ports.customerWrite.update(tenantId, input.customerId, patch);
      return { customer: mapCustomer(updated) };
    },

    async findDuplicateCustomers(input) {
      void input;
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, phone_e164, created_at")
        .eq("company_id", tenantId)
        .limit(500);
      if (error) throw new Error(error.message);

      const groups = new Map<string, CrmCustomerSummary[]>();
      for (const row of data ?? []) {
        const customer = mapCustomer({
          id: String(row.id),
          displayName: String(row.name ?? ""),
          email: row.email == null ? null : String(row.email),
          phone: row.phone == null ? null : String(row.phone),
          createdAt: row.created_at == null ? undefined : String(row.created_at),
        });
        const phoneKey =
          typeof row.phone_e164 === "string" && row.phone_e164.trim()
            ? `e164:${row.phone_e164.trim()}`
            : normalizeDedupPhoneKey(customer.phone);
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

      return {
        groups: [...groups.entries()]
          .filter(([, members]) => members.length > 1)
          .map(([key, members]) => ({ key, customers: members })),
      };
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
      if (!tenantId || input.companyId !== tenantId) {
        throw new Error("Company context is required.");
      }
      // Intentionally blocked: no Application Layer merge command exists.
      // Webhook uses ownership-hardened createSupabaseCrmAgentToolPorts.mergeCustomers.
      throw new Error(
        "Customer merge is not yet exposed via Application Layer commands. Use CRM UI for merge operations.",
      );
    },

    async importCustomers(input) {
      if (!input.confirmed) {
        return { imported: 0, skipped: 0, errors: ["Import requires explicit confirmation."] };
      }
      if (!tenantId || input.companyId !== tenantId) {
        throw new Error("Company context mismatch.");
      }

      const errors: string[] = [];
      let imported = 0;
      let skipped = 0;
      const rowResults: Array<{
        index: number;
        status: "imported" | "skipped" | "duplicate" | "manual_review" | "invalid";
        code?: string;
        phoneE164?: string | null;
      }> = [];

      for (let index = 0; index < input.rows.length; index += 1) {
        const row = input.rows[index]!;
        if (!row.name?.trim()) {
          skipped += 1;
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
            errors.push(`Row ${index}: ${preview.code}`);
            rowResults.push({
              index,
              status:
                preview.code === "phone_region_required" ||
                preview.code === "phone_identity_unresolved"
                  ? "manual_review"
                  : "invalid",
              code: preview.code,
            });
            continue;
          }

          await ports.customerWrite.create({
            tenantId,
            displayName: row.name.trim(),
            email: row.email,
            phone: phone ?? undefined,
            phoneIdentity: preview.identity ?? buildCustomerPhoneIdentityColumns({ phone: null }),
            phoneRegion: preview.regionUsed ?? undefined,
          });
          imported += 1;
          rowResults.push({
            index,
            status: "imported",
            code: preview.code,
            phoneE164: preview.phoneE164,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(message);
          skipped += 1;
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
      void input.userId;
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

      // Company scope = tenantId; customer scope = trustedCustomerId only (Phase 5C).
      const listed = await ports.invoiceRead.listForCustomer(tenantId, trusted);
      let invoices = listed.map((inv) => ({
        id: inv.id,
        customer_id: inv.customerId,
        amount: inv.amountCents / 100,
        status: inv.status,
        due_date: inv.generatedAt,
      }));

      if (input.status) {
        invoices = invoices.filter((inv) => inv.status === input.status);
      }
      if (input.overdueOnly) {
        invoices = invoices.filter((inv) => inv.status === "overdue" || inv.status === "issued");
      }

      return { invoices, total: invoices.length };
    },

    async searchBookings(input) {
      void input.userId;
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
      const bookings = await ports.bookingRead.listForCustomer(tenantId, trusted);

      const daysBack = input.daysBack ?? 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);

      const filtered = bookings.filter((b) => new Date(b.scheduledAt) >= cutoff);

      return {
        bookings: filtered.map((b) => ({
          id: b.id,
          customer_id: b.customerId,
          service: b.serviceName ?? null,
          status: b.status,
          scheduled_at: b.scheduledAt,
        })),
        total: filtered.length,
      };
    },

    async knowledgeSearch(input) {
      const companyId =
        typeof input.companyId === "string" ? input.companyId.trim() : "";
      if (!companyId) {
        return {
          results: [],
          contextText: "Company context is required for knowledge retrieval.",
          items: [],
        };
      }
      if (companyId !== portContext.companyId && !portContext.isSuperAdmin) {
        return {
          results: [],
          contextText: "Company context is required for knowledge retrieval.",
          items: [],
        };
      }
      if (!retrieveKnowledge) {
        return {
          results: [],
          contextText:
            "Knowledge retrieval is unavailable: no retrieval provider configured for this runtime.",
          items: [],
        };
      }
      const result = await retrieveKnowledge({
        companyId: portContext.companyId,
        userId: input.userId,
        query: input.query,
      });
      return {
        ...result,
        items: result.results,
      };
    },
  };
}
