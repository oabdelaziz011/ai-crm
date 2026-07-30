import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCustomerServicePort } from "@workspace/automation-platform";
import type {
  Customer360AccessContext,
  Customer360DataPort,
  Customer360FetchInput,
  Customer360RawBundle,
} from "../ports/customer-360-data-port.js";
import type {
  Customer360BookingDto,
  Customer360ConversationSummaryDto,
  Customer360CurrentConversationDto,
  Customer360InvoiceDto,
  Customer360ProfileDto,
} from "../dto/customer-360-dto.js";

export type CreateSupabaseCustomer360DataPortOptions = {
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
  getActorUserId?: () => string | null;
};

function canView(access: Customer360AccessContext, permission: string): boolean {
  return access.isSuperAdmin || access.hasPermission(permission);
}

function categorizeInvoice(status: string, dueDate: string | null | undefined, now: Date): Customer360InvoiceDto["category"] {
  const normalized = status.toLowerCase();
  if (["paid", "completed", "settled"].includes(normalized)) return "paid";
  if (dueDate && new Date(dueDate) < now && !["paid", "completed", "settled", "cancelled"].includes(normalized)) {
    return "overdue";
  }
  return "unpaid";
}

export function createSupabaseCustomer360DataPort(
  client: SupabaseClient,
  options: CreateSupabaseCustomer360DataPortOptions = {},
): Customer360DataPort {
  const customerService = createSupabaseCustomerServicePort(client, options);

  return {
    async resolveCustomerId(input) {
      if (input.customerId?.trim()) return input.customerId.trim();

      if (input.conversationId) {
        const { data, error } = await client
          .from("conversations")
          .select("customer_id, metadata")
          .eq("id", input.conversationId)
          .eq("company_id", input.companyId)
          .maybeSingle();

        if (!error && data?.customer_id) {
          return String(data.customer_id);
        }

        const metadata = (data?.metadata as Record<string, unknown> | null) ?? null;
        const metadataCustomerId =
          typeof metadata?.customerId === "string"
            ? metadata.customerId
            : typeof metadata?.customer_id === "string"
              ? metadata.customer_id
              : null;
        if (metadataCustomerId) return metadataCustomerId;
      }

      const email = input.senderEmail?.trim().toLowerCase();
      if (email) {
        const found = await customerService.findCustomer({
          companyId: input.companyId,
          userId: input.actorUserId,
          lookupBy: "email",
          lookupValue: email,
        });
        if (found.status === "found") return found.customer.id;
      }

      const phone = input.senderPhone?.trim();
      if (phone) {
        const found = await customerService.findCustomer({
          companyId: input.companyId,
          userId: input.actorUserId,
          lookupBy: "phone",
          lookupValue: phone,
        });
        if (found.status === "found") return found.customer.id;
      }

      return null;
    },

    async fetchBundle(access, input) {
      if (!canView(access, "customers.view")) {
        return null;
      }

      const found = await customerService.findCustomer({
        companyId: input.companyId,
        userId: access.actorUserId,
        lookupBy: "customer_id",
        lookupValue: input.customerId,
      });

      if (found.status !== "found") {
        return null;
      }

      const customer = found.customer;
      const profile: Customer360ProfileDto = {
        id: customer.id,
        name: customer.name,
        emails: customer.email ? [customer.email] : [],
        phones: customer.phone ? [customer.phone] : [],
        tags: [],
        segment: null,
        language: null,
        timezone: null,
        assignedEmployeeId: null,
        assignedEmployeeName: null,
        notes: customer.notes,
      };

      const [previousConversations, bookings, invoices] = await Promise.all([
        canView(access, "customers.view")
          ? fetchPreviousConversations(client, input.companyId, input.customerId, input.conversationId)
          : Promise.resolve([]),
        canView(access, "bookings.view")
          ? fetchBookings(client, access, input)
          : Promise.resolve({ upcoming: [], completed: [], cancelled: [] }),
        canView(access, "invoices.view")
          ? fetchInvoices(client, input.companyId, input.customerId)
          : Promise.resolve({ unpaid: [], overdue: [], paid: [] }),
      ]);

      const currentConversation = input.conversationId
        ? buildCurrentConversation(input.conversationId, input.channelType, input.recentMessages)
        : undefined;

      return {
        profile,
        previousConversations,
        currentConversation,
        opportunities: [],
        bookings,
        invoices,
        support: { openTickets: [] },
      };
    },
  };
}

async function fetchPreviousConversations(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
  excludeConversationId?: string,
): Promise<Customer360ConversationSummaryDto[]> {
  const { data, error } = await client
    .from("conversations")
    .select("id, channel_type, state, last_message_preview, last_message_at")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => String(row.id) !== excludeConversationId)
    .map((row) => ({
      id: String(row.id),
      channelType: String(row.channel_type ?? "unknown"),
      status: String(row.state ?? "active"),
      lastMessagePreview: row.last_message_preview ? String(row.last_message_preview) : null,
      lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
      sentiment: null,
    }));
}

function buildCurrentConversation(
  conversationId: string,
  channelType: string | null | undefined,
  recentMessages: Customer360FetchInput["recentMessages"],
): Customer360CurrentConversationDto {
  return {
    id: conversationId,
    channelType: channelType ?? "unknown",
    status: "active",
    latestMessages: recentMessages ?? [],
    sentiment: null,
  };
}

async function fetchBookings(
  client: SupabaseClient,
  access: Customer360AccessContext,
  input: Customer360FetchInput,
): Promise<Customer360RawBundle["bookings"]> {
  const now = new Date();

  const [schedulingResult, legacyResult] = await Promise.all([
    client
      .from("scheduling_bookings")
      .select("id, status, start_at, service_id")
      .eq("company_id", input.companyId)
      .eq("customer_id", input.customerId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true })
      .limit(50),
    client
      .from("bookings")
      .select("id, status, booking_date, service")
      .eq("company_id", input.companyId)
      .eq("customer_id", input.customerId)
      .order("booking_date", { ascending: true })
      .limit(50),
  ]);

  if (schedulingResult.error) throw schedulingResult.error;
  if (legacyResult.error) throw legacyResult.error;

  const bookings: Customer360BookingDto[] = [
    ...(schedulingResult.data ?? []).map((row) => ({
      id: String(row.id),
      service: row.service_id ? String(row.service_id) : null,
      status: String(row.status),
      scheduledAt: row.start_at ? String(row.start_at) : null,
      source: "scheduling" as const,
    })),
    ...(legacyResult.data ?? []).map((row) => ({
      id: String(row.id),
      service: row.service ? String(row.service) : null,
      status: String(row.status),
      scheduledAt: row.booking_date ? String(row.booking_date) : null,
      source: "legacy" as const,
    })),
  ];

  return {
    upcoming: bookings.filter(
      (booking) =>
        booking.scheduledAt &&
        new Date(booking.scheduledAt) >= now &&
        !["cancelled", "canceled"].includes(booking.status.toLowerCase()),
    ),
    completed: bookings.filter((booking) => ["completed", "confirmed", "done"].includes(booking.status.toLowerCase())),
    cancelled: bookings.filter((booking) => ["cancelled", "canceled"].includes(booking.status.toLowerCase())),
  };
}

async function fetchInvoices(
  client: SupabaseClient,
  companyId: string,
  customerId: string,
): Promise<Customer360RawBundle["invoices"]> {
  const now = new Date();
  const { data, error } = await client
    .from("invoices")
    .select("id, total_cents, status, due_at, currency")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("due_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const invoices: Customer360InvoiceDto[] = (data ?? []).map((row) => {
    const status = String(row.status);
    const dueDate = row.due_at ? String(row.due_at) : null;
    return {
      id: String(row.id),
      amount: Number(row.total_cents ?? 0) / 100,
      currency: row.currency ? String(row.currency) : "USD",
      status,
      dueDate,
      category: categorizeInvoice(status, dueDate, now),
    };
  });

  return {
    unpaid: invoices.filter((invoice) => invoice.category === "unpaid"),
    overdue: invoices.filter((invoice) => invoice.category === "overdue"),
    paid: invoices.filter((invoice) => invoice.category === "paid"),
  };
}
