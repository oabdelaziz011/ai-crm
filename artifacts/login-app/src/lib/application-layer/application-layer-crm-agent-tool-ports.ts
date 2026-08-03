import type {
  CrmAgentToolPorts,
  CrmCustomerSummary,
} from "@workspace/ai-tool-router";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import { createLoginAppApplicationPorts } from "./create-login-app-application-ports.js";
import {
  buildToolApplicationContext,
  createLoginAppApplicationServices,
  unwrapQuery,
} from "./application-layer-tool-context.js";
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

function normalizeEmailKey(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export type CreateApplicationLayerCrmAgentToolPortsOptions = {
  portContext: LoginAppPortContext;
};

/** CRM agent ports backed by Application Layer read/write ports — no direct Supabase for domain reads. */
export function createApplicationLayerCrmAgentToolPorts(
  options: CreateApplicationLayerCrmAgentToolPortsOptions,
): CrmAgentToolPorts {
  const { portContext } = options;
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
      const updated = await ports.customerWrite.update(tenantId, input.customerId, {
        [input.field]: input.value,
      });
      return { customer: mapCustomer(updated) };
    },

    async findDuplicateCustomers(input) {
      void input;
      const customers = (await ports.customerRead.search(tenantId, "", 500)).map(mapCustomer);
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
      throw new Error(
        "Customer merge is not yet exposed via Application Layer commands. Use CRM UI for merge operations.",
      );
    },

    async importCustomers(input) {
      if (!input.confirmed) {
        return { imported: 0, skipped: 0, errors: ["Import requires explicit confirmation."] };
      }

      const errors: string[] = [];
      let imported = 0;
      let skipped = 0;

      for (const row of input.rows) {
        if (!row.name?.trim()) {
          skipped += 1;
          continue;
        }
        try {
          await ports.customerWrite.create({
            tenantId,
            displayName: row.name.trim(),
            email: row.email,
            phone: row.phone,
          });
          imported += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
          skipped += 1;
        }
      }

      return { imported, skipped, errors };
    },

    async searchInvoices(input) {
      void input.userId;
      const queue = await ports.bookingRead.listQueue(tenantId, { pageSize: 200 });
      const customerIds = [...new Set(queue.map((b) => b.customerId))].slice(0, 50);
      const invoiceLists = await Promise.all(
        customerIds.map((customerId) => ports.invoiceRead.listForCustomer(tenantId, customerId)),
      );
      let invoices = invoiceLists.flat().map((inv) => ({
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
      const bookings = input.customerId
        ? await ports.bookingRead.listForCustomer(tenantId, input.customerId)
        : await ports.bookingRead.listQueue(tenantId, { pageSize: 200 });

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
      const services = createLoginAppApplicationServices(portContext);
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.knowledge.searchKnowledge(input.query, ctx, { limit: 8 });
      const search = unwrapQuery(result);
      const results = search.chunks.slice(0, 8).map((chunk, index) => ({
        title: chunk.documentTitle ?? `Source ${index + 1}`,
        excerpt: chunk.content.slice(0, 280),
        confidence: chunk.score ?? search.confidence,
      }));
      return {
        results,
        contextText: search.chunks.map((c) => c.content).join("\n\n") || "No knowledge context returned.",
        items: results,
      };
    },
  };
}
