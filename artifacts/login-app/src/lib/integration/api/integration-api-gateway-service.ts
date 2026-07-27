import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiAuthContext, ApiScope, PaginatedResult } from "@/lib/integration/types";
import { getBranchServices } from "@/lib/company/branches";
import { getOrganizationPlatformServices } from "@/lib/organization/services/organization-platform-factory";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";

/** Public API gateway — delegates to existing domain services. */
export class IntegrationApiGatewayService {
  private readonly bookings: BookingRepository;

  constructor(private readonly client: SupabaseClient) {
    this.bookings = new BookingRepository(client);
  }

  async listCustomers(ctx: ApiAuthContext, cursor?: string, limit = 25): Promise<PaginatedResult<Record<string, unknown>>> {
    let query = this.client
      .from("customers")
      .select("id, name, email, phone, created_at")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: slice.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, createdAt: r.created_at })),
      cursor: slice.length ? String(slice[slice.length - 1].created_at) : null,
      hasMore,
    };
  }

  async getCustomer(ctx: ApiAuthContext, customerId: string) {
    const { data, error } = await this.client
      .from("customers")
      .select("id, name, email, phone, created_at, updated_at")
      .eq("company_id", ctx.companyId)
      .eq("id", customerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { id: data.id, name: data.name, email: data.email, phone: data.phone, createdAt: data.created_at };
  }

  async listBookings(ctx: ApiAuthContext, date?: string, limit = 25): Promise<PaginatedResult<Record<string, unknown>>> {
    let query = this.client
      .from("scheduling_bookings")
      .select("id, customer_id, branch_id, status, start_at, end_at, created_at")
      .eq("company_id", ctx.companyId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(limit);
    if (date) {
      query = query.gte("start_at", `${date}T00:00:00.000Z`).lt("start_at", `${date}T23:59:59.999Z`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { data: data ?? [], cursor: null, hasMore: false };
  }

  async getBooking(ctx: ApiAuthContext, bookingId: string) {
    const booking = await this.bookings.getById(bookingId, ctx.companyId);
    if (!booking) return null;
    return booking;
  }

  async listBranches(ctx: ApiAuthContext) {
    return getBranchServices().branches.list(ctx.companyId).then((rows) =>
      rows.map((b) => ({ id: b.id, name: b.name, code: b.code, timezone: b.timezone, status: b.status })),
    );
  }

  async listDoctors(ctx: ApiAuthContext) {
    const { data, error } = await this.client
      .from("scheduling_resources")
      .select("id, name, resource_type, branch_id, is_active")
      .eq("company_id", ctx.companyId)
      .eq("resource_type", "person")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listInvoices(ctx: ApiAuthContext, limit = 25) {
    const { data, error } = await this.client
      .from("customer_invoices")
      .select("id, invoice_number, status, total_cents, paid_cents, currency, created_at")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { data: data ?? [], cursor: null, hasMore: false };
  }

  async listPayments(ctx: ApiAuthContext, limit = 25) {
    const { data, error } = await this.client
      .from("customer_payments")
      .select("id, invoice_id, amount_cents, status, provider_code, created_at")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { data: data ?? [], cursor: null, hasMore: false };
  }

  async getOrganizationOverview(ctx: ApiAuthContext) {
    return getOrganizationPlatformServices().getOverview(ctx.companyId);
  }
}

export const ENDPOINT_SCOPES: Record<string, ApiScope[]> = {
  "GET /customers": ["customers.read"],
  "GET /customers/:id": ["customers.read"],
  "GET /bookings": ["bookings.read"],
  "GET /bookings/:id": ["bookings.read"],
  "GET /branches": ["branches.read"],
  "GET /doctors": ["branches.read"],
  "GET /invoices": ["invoices.read"],
  "GET /payments": ["payments.read"],
  "GET /organization": ["organization.read"],
};
