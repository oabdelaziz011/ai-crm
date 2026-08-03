import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiAuthContext, ApiScope, PaginatedResult } from "@/lib/integration/types";
import { getBranchServices } from "@/lib/company/branches";
import { getOrganizationPlatformServices } from "@/lib/organization/services/organization-platform-factory";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import { getLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-read-port-adapter";
import type { TicketPlatformServices, TicketServiceContext } from "@workspace/ticket-platform";
import { TICKET_PERMISSIONS } from "@workspace/ticket-platform";
import { getLoginAppHandoffPlatformServices } from "@/lib/human-handoff-platform/handoff-read-port-adapter";
import type { HandoffPlatformServices, HandoffServiceContext } from "@workspace/human-handoff-platform";
import { HANDOFF_PERMISSIONS } from "@workspace/human-handoff-platform";
import { getLoginAppLeadPlatformServices } from "@/lib/lead-platform/lead-read-port-adapter";
import type { LeadPlatformServices, LeadServiceContext } from "@workspace/lead-platform";
import { LEAD_PERMISSIONS } from "@workspace/lead-platform";
import { getLoginAppAppointmentPlatformServices } from "@/lib/appointment-platform/appointment-read-port-adapter";
import type { AppointmentPlatformServices, AppointmentServiceContext } from "@workspace/appointment-platform";
import { APPOINTMENT_PERMISSIONS } from "@workspace/appointment-platform";

/** Public API gateway — delegates to existing domain services. */
export class IntegrationApiGatewayService {
  private readonly bookings: BookingRepository;
  private readonly platform: TicketPlatformServices;
  private readonly handoffPlatform: HandoffPlatformServices;
  private readonly leadPlatform: LeadPlatformServices;
  private readonly appointmentPlatform: AppointmentPlatformServices;

  constructor(private readonly client: SupabaseClient) {
    this.bookings = new BookingRepository(client);
    this.platform = getLoginAppTicketPlatformServices(client);
    this.handoffPlatform = getLoginAppHandoffPlatformServices(client);
    this.leadPlatform = getLoginAppLeadPlatformServices(client);
    this.appointmentPlatform = getLoginAppAppointmentPlatformServices(client);
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

  private ticketContext(ctx: ApiAuthContext): TicketServiceContext {
    const scopeSet = new Set(ctx.scopes);
    const hasWrite = scopeSet.has("tickets.write");
    return {
      userId: ctx.authId ?? null,
      companyId: ctx.companyId,
      isSuperAdmin: false,
      hasPermission: (code) => {
        if (code === TICKET_PERMISSIONS.view) return scopeSet.has("tickets.read") || hasWrite;
        if (code === TICKET_PERMISSIONS.create) return hasWrite;
        if (code === TICKET_PERMISSIONS.edit) return hasWrite;
        if (code === TICKET_PERMISSIONS.assign) return hasWrite;
        if (code === TICKET_PERMISSIONS.comment) return hasWrite;
        if (code === TICKET_PERMISSIONS.close) return hasWrite;
        if (code === TICKET_PERMISSIONS.manage) return hasWrite;
        return false;
      },
    };
  }

  private get platformServices(): TicketPlatformServices {
    return this.platform;
  }

  async listTickets(ctx: ApiAuthContext, query: Record<string, string | undefined>) {
    return this.platformServices.queries.searchTickets(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      query: query.q,
      status: query.status as never,
      priority: query.priority as never,
      customerId: query.customerId,
      conversationId: query.conversationId,
      assigneeName: query.assigneeName,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined,
    });
  }

  async getTicket(ctx: ApiAuthContext, ticketId: string) {
    return this.platformServices.queries.getTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
    });
  }

  async createTicket(
    ctx: ApiAuthContext,
    body: {
      subject: string;
      description?: string;
      priority?: string;
      customerId?: string;
      conversationId?: string;
    },
  ) {
    return this.platformServices.commands.createTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      subject: body.subject,
      description: body.description,
      priority: body.priority as never,
      customerId: body.customerId,
      conversationId: body.conversationId,
    });
  }

  async updateTicket(
    ctx: ApiAuthContext,
    ticketId: string,
    body: { subject?: string; description?: string },
  ) {
    return this.platformServices.commands.updateTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      ...body,
    });
  }

  async closeTicket(
    ctx: ApiAuthContext,
    ticketId: string,
    body: { resolutionNote?: string; status?: "resolved" | "closed" },
  ) {
    return this.platformServices.commands.closeTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      ...body,
    });
  }

  async reopenTicket(ctx: ApiAuthContext, ticketId: string, body: { reason?: string }) {
    return this.platformServices.commands.reopenTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      reason: body.reason,
    });
  }

  async deleteTicket(ctx: ApiAuthContext, ticketId: string) {
    return this.platformServices.commands.deleteTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
    });
  }

  async assignTicket(
    ctx: ApiAuthContext,
    ticketId: string,
    body: { assigneeUserId?: string; assigneeName?: string },
  ) {
    return this.platformServices.commands.assignTicket(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      ...body,
    });
  }

  async addTicketComment(
    ctx: ApiAuthContext,
    ticketId: string,
    body: { body: string; isInternal?: boolean },
  ) {
    return this.platformServices.commands.addComment(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      body: body.body,
      isInternal: body.isInternal,
    });
  }

  async changeTicketPriority(ctx: ApiAuthContext, ticketId: string, body: { priority: string }) {
    return this.platformServices.commands.changePriority(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      priority: body.priority as never,
    });
  }

  async changeTicketStatus(ctx: ApiAuthContext, ticketId: string, body: { status: string }) {
    return this.platformServices.commands.changeStatus(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      ticketId,
      status: body.status as never,
    });
  }

  async listCustomerTickets(ctx: ApiAuthContext, customerId: string, limit?: number) {
    return this.platformServices.queries.listCustomerTickets(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      customerId,
      limit,
    });
  }

  async listConversationTickets(ctx: ApiAuthContext, conversationId: string) {
    return this.platformServices.queries.listConversationTickets(this.ticketContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
    });
  }

  private handoffContext(ctx: ApiAuthContext): HandoffServiceContext {
    return {
      userId: ctx.userId ?? null,
      companyId: ctx.companyId,
      isSuperAdmin: ctx.isSuperAdmin ?? false,
      hasPermission: (code) => this.hasMappedPermission(ctx, code),
    };
  }

  private hasMappedPermission(ctx: ApiAuthContext, code: string): boolean {
    const scopeMap: Record<string, ApiScope[]> = {
      [HANDOFF_PERMISSIONS.view]: ["handoff.read"],
      [HANDOFF_PERMISSIONS.transfer]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.accept]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.reject]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.assign]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.queue]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.escalate]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.returnToAi]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.presence]: ["handoff.write"],
      [HANDOFF_PERMISSIONS.manage]: ["handoff.manage"],
    };
    const scopes = scopeMap[code] ?? [];
    return scopes.some((scope) => ctx.scopes.includes(scope));
  }

  async transferConversation(
    ctx: ApiAuthContext,
    conversationId: string,
    body: { toUserId?: string; toQueueId?: string; reason?: string },
  ) {
    return this.handoffPlatform.commands.transferConversation(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      ...body,
    });
  }

  async acceptConversation(ctx: ApiAuthContext, conversationId: string, body: { requestId?: string }) {
    return this.handoffPlatform.commands.acceptConversation(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      requestId: body.requestId,
    });
  }

  async rejectConversation(
    ctx: ApiAuthContext,
    conversationId: string,
    body: { requestId?: string; reason?: string },
  ) {
    return this.handoffPlatform.commands.rejectConversation(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      ...body,
    });
  }

  async assignConversation(
    ctx: ApiAuthContext,
    conversationId: string,
    body: { assigneeUserId: string; reason?: string },
  ) {
    return this.handoffPlatform.commands.assignConversation(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      ...body,
    });
  }

  async queueConversation(
    ctx: ApiAuthContext,
    conversationId: string,
    body: { queueId: string; reason?: string },
  ) {
    return this.handoffPlatform.commands.queueConversation(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      ...body,
    });
  }

  async escalateConversation(
    ctx: ApiAuthContext,
    conversationId: string,
    body: { triggerCode: string; reason?: string; targetQueueId?: string },
  ) {
    return this.handoffPlatform.commands.escalateConversation(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      triggerCode: body.triggerCode as never,
      reason: body.reason,
      targetQueueId: body.targetQueueId,
    });
  }

  async returnConversationToAi(
    ctx: ApiAuthContext,
    conversationId: string,
    body: { reason?: string },
  ) {
    return this.handoffPlatform.commands.returnConversationToAi(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      reason: body.reason,
    });
  }

  async getHandoffOwnership(ctx: ApiAuthContext, conversationId: string) {
    return this.handoffPlatform.reads.getOwnership(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
    });
  }

  async getHandoffOwnershipHistory(ctx: ApiAuthContext, conversationId: string, limit?: number) {
    return this.handoffPlatform.reads.getOwnershipHistory(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
      limit,
    });
  }

  async getAgentWorkspace(ctx: ApiAuthContext, conversationId: string) {
    return this.handoffPlatform.reads.getAgentWorkspace(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      conversationId,
    });
  }

  async listHandoffQueues(ctx: ApiAuthContext) {
    return this.handoffPlatform.reads.listQueues(this.handoffContext(ctx), {
      companyId: ctx.companyId,
    });
  }

  async updateAgentPresence(
    ctx: ApiAuthContext,
    body: { state: string; viewingConversationId?: string },
  ) {
    return this.handoffPlatform.commands.updatePresence(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      state: body.state as never,
      viewingConversationId: body.viewingConversationId,
    });
  }

  async getHandoffMetrics(ctx: ApiAuthContext, periodStartIso?: string) {
    return this.handoffPlatform.reads.fetchMetrics(this.handoffContext(ctx), {
      companyId: ctx.companyId,
      periodStartIso,
    });
  }

  private leadContext(ctx: ApiAuthContext): LeadServiceContext {
    return {
      userId: ctx.userId ?? null,
      companyId: ctx.companyId,
      isSuperAdmin: ctx.isSuperAdmin ?? false,
      hasPermission: (code) => this.hasLeadMappedPermission(ctx, code),
    };
  }

  private hasLeadMappedPermission(ctx: ApiAuthContext, code: string): boolean {
    const scopeMap: Record<string, ApiScope[]> = {
      [LEAD_PERMISSIONS.view]: ["leads.read"],
      [LEAD_PERMISSIONS.create]: ["leads.write"],
      [LEAD_PERMISSIONS.edit]: ["leads.write"],
      [LEAD_PERMISSIONS.assign]: ["leads.write"],
      [LEAD_PERMISSIONS.qualify]: ["leads.write"],
      [LEAD_PERMISSIONS.convert]: ["leads.write"],
      [LEAD_PERMISSIONS.merge]: ["leads.write"],
      [LEAD_PERMISSIONS.archive]: ["leads.write"],
      [LEAD_PERMISSIONS.manage]: ["leads.manage"],
    };
    const scopes = scopeMap[code] ?? [];
    return scopes.some((scope) => ctx.scopes.includes(scope));
  }

  async listLeads(ctx: ApiAuthContext, query?: string, limit = 25, offset = 0) {
    return this.leadPlatform.reads.searchLeads(this.leadContext(ctx), {
      companyId: ctx.companyId,
      query,
      limit,
      offset,
    });
  }

  async getLead(ctx: ApiAuthContext, leadId: string) {
    return this.leadPlatform.reads.getLead(this.leadContext(ctx), { companyId: ctx.companyId, leadId });
  }

  async createLead(ctx: ApiAuthContext, body: Record<string, unknown>) {
    return this.leadPlatform.commands.createLead(this.leadContext(ctx), {
      companyId: ctx.companyId,
      title: String(body.title ?? ""),
      contactName: body.contactName ? String(body.contactName) : undefined,
      email: body.email ? String(body.email) : undefined,
      phone: body.phone ? String(body.phone) : undefined,
      companyName: body.companyName ? String(body.companyName) : undefined,
      conversationId: body.conversationId ? String(body.conversationId) : undefined,
      estimatedValue: body.estimatedValue != null ? Number(body.estimatedValue) : undefined,
    });
  }

  async updateLead(ctx: ApiAuthContext, leadId: string, body: Record<string, unknown>) {
    return this.leadPlatform.commands.updateLead(this.leadContext(ctx), {
      companyId: ctx.companyId,
      leadId,
      title: body.title ? String(body.title) : undefined,
      contactName: body.contactName ? String(body.contactName) : undefined,
      email: body.email ? String(body.email) : undefined,
      phone: body.phone ? String(body.phone) : undefined,
      companyName: body.companyName ? String(body.companyName) : undefined,
      priority: body.priority as never,
      estimatedValue: body.estimatedValue != null ? Number(body.estimatedValue) : undefined,
      score: body.score != null ? Number(body.score) : undefined,
    });
  }

  async deleteLead(ctx: ApiAuthContext, leadId: string) {
    return this.leadPlatform.commands.deleteLead(this.leadContext(ctx), { companyId: ctx.companyId, leadId });
  }

  async assignLead(ctx: ApiAuthContext, leadId: string, body: { assigneeUserId: string }) {
    return this.leadPlatform.commands.assignLead(this.leadContext(ctx), {
      companyId: ctx.companyId,
      leadId,
      assigneeUserId: body.assigneeUserId,
    });
  }

  async mergeLeads(ctx: ApiAuthContext, leadId: string, body: { duplicateLeadIds: string[] }) {
    return this.leadPlatform.commands.mergeLead(this.leadContext(ctx), {
      companyId: ctx.companyId,
      primaryLeadId: leadId,
      duplicateLeadIds: body.duplicateLeadIds,
    });
  }

  async convertLead(ctx: ApiAuthContext, leadId: string) {
    return this.leadPlatform.commands.convertLead(this.leadContext(ctx), { companyId: ctx.companyId, leadId });
  }

  async qualifyLead(ctx: ApiAuthContext, leadId: string, body?: { score?: number }) {
    return this.leadPlatform.commands.qualifyLead(this.leadContext(ctx), {
      companyId: ctx.companyId,
      leadId,
      score: body?.score,
    });
  }

  async changeLeadStage(ctx: ApiAuthContext, leadId: string, body: { stageId: string }) {
    return this.leadPlatform.commands.changeLeadStage(this.leadContext(ctx), {
      companyId: ctx.companyId,
      leadId,
      stageId: body.stageId,
    });
  }

  async listLeadPipelines(ctx: ApiAuthContext) {
    return this.leadPlatform.reads.listPipelines(this.leadContext(ctx), { companyId: ctx.companyId });
  }

  async listLeadStages(ctx: ApiAuthContext, pipelineId: string) {
    return this.leadPlatform.reads.listStages(this.leadContext(ctx), { companyId: ctx.companyId, pipelineId });
  }

  async listLeadActivities(ctx: ApiAuthContext, leadId: string, limit?: number) {
    return this.leadPlatform.reads.listLeadActivities(this.leadContext(ctx), {
      companyId: ctx.companyId,
      leadId,
      limit,
    });
  }

  async listLeadNotes(ctx: ApiAuthContext, leadId: string) {
    return this.leadPlatform.reads.listLeadNotes(this.leadContext(ctx), { companyId: ctx.companyId, leadId });
  }

  async addLeadNote(ctx: ApiAuthContext, leadId: string, body: { body: string; isInternal?: boolean }) {
    return this.leadPlatform.commands.addLeadNote(this.leadContext(ctx), {
      companyId: ctx.companyId,
      leadId,
      body: body.body,
      isInternal: body.isInternal,
    });
  }

  async getLeadMetrics(ctx: ApiAuthContext, periodStartIso?: string) {
    return this.leadPlatform.reads.fetchDashboardMetrics(this.leadContext(ctx), {
      companyId: ctx.companyId,
      periodStartIso,
    });
  }

  private appointmentContext(ctx: ApiAuthContext): AppointmentServiceContext {
    return {
      userId: ctx.userId ?? null,
      companyId: ctx.companyId,
      isSuperAdmin: ctx.isSuperAdmin ?? false,
      hasPermission: (code) => this.hasAppointmentMappedPermission(ctx, code),
    };
  }

  private hasAppointmentMappedPermission(ctx: ApiAuthContext, code: string): boolean {
    const scopeMap: Record<string, ApiScope[]> = {
      [APPOINTMENT_PERMISSIONS.view]: ["bookings.read"],
      [APPOINTMENT_PERMISSIONS.create]: ["bookings.write"],
      [APPOINTMENT_PERMISSIONS.edit]: ["bookings.write"],
      [APPOINTMENT_PERMISSIONS.delete]: ["bookings.write"],
    };
    const scopes = scopeMap[code] ?? [];
    return scopes.some((scope) => ctx.scopes.includes(scope));
  }

  async listAppointments(
    ctx: ApiAuthContext,
    query?: string,
    customerId?: string,
    limit = 25,
    offset = 0,
  ) {
    return this.appointmentPlatform.reads.searchAppointments(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      query,
      customerId,
      limit,
      offset,
    });
  }

  async getAppointment(ctx: ApiAuthContext, appointmentId: string) {
    return this.appointmentPlatform.reads.getAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
    });
  }

  async createAppointment(ctx: ApiAuthContext, body: Record<string, unknown>) {
    return this.appointmentPlatform.commands.createAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      customerId: body.customerId ? String(body.customerId) : undefined,
      leadId: body.leadId ? String(body.leadId) : undefined,
      conversationId: body.conversationId ? String(body.conversationId) : undefined,
      resourceId: String(body.resourceId ?? ""),
      serviceId: String(body.serviceId ?? ""),
      date: String(body.date ?? ""),
      slotStart: String(body.slotStart ?? ""),
      source: body.source as never,
      notes: body.notes ? String(body.notes) : undefined,
      branchId: body.branchId ? String(body.branchId) : undefined,
    });
  }

  async updateAppointment(ctx: ApiAuthContext, appointmentId: string, body: Record<string, unknown>) {
    return this.appointmentPlatform.commands.updateAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
      notes: body.notes ? String(body.notes) : undefined,
    });
  }

  async cancelAppointment(ctx: ApiAuthContext, appointmentId: string, body: Record<string, unknown>) {
    return this.appointmentPlatform.commands.cancelAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
      reason: body.reason ? String(body.reason) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    });
  }

  async rescheduleAppointment(ctx: ApiAuthContext, appointmentId: string, body: Record<string, unknown>) {
    return this.appointmentPlatform.commands.rescheduleAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
      date: String(body.date ?? ""),
      slotStart: String(body.slotStart ?? ""),
    });
  }

  async confirmAppointment(ctx: ApiAuthContext, appointmentId: string) {
    return this.appointmentPlatform.commands.confirmAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
    });
  }

  async checkInAppointment(ctx: ApiAuthContext, appointmentId: string) {
    return this.appointmentPlatform.commands.checkInAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
    });
  }

  async completeAppointment(ctx: ApiAuthContext, appointmentId: string) {
    return this.appointmentPlatform.commands.completeAppointment(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      appointmentId,
    });
  }

  async getAppointmentAvailability(
    ctx: ApiAuthContext,
    resourceId: string,
    serviceId: string,
    date: string,
  ) {
    return this.appointmentPlatform.reads.fetchAvailability(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      resourceId,
      serviceId,
      date,
    });
  }

  async getAppointmentMetrics(ctx: ApiAuthContext, periodStartIso?: string) {
    return this.appointmentPlatform.reads.fetchDashboardMetrics(this.appointmentContext(ctx), {
      companyId: ctx.companyId,
      periodStartIso,
    });
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
  "GET /tickets": ["tickets.read"],
  "GET /tickets/:id": ["tickets.read"],
  "POST /tickets": ["tickets.write"],
  "PATCH /tickets/:id": ["tickets.write"],
  "POST /tickets/:id/close": ["tickets.write"],
  "POST /tickets/:id/reopen": ["tickets.write"],
  "DELETE /tickets/:id": ["tickets.write"],
  "POST /tickets/:id/assign": ["tickets.write"],
  "POST /tickets/:id/comments": ["tickets.write"],
  "POST /tickets/:id/priority": ["tickets.write"],
  "POST /tickets/:id/status": ["tickets.write"],
  "GET /customers/:id/tickets": ["tickets.read"],
  "GET /conversations/:id/tickets": ["tickets.read"],
  "POST /conversations/:id/handoff/transfer": ["handoff.write"],
  "POST /conversations/:id/handoff/accept": ["handoff.write"],
  "POST /conversations/:id/handoff/reject": ["handoff.write"],
  "POST /conversations/:id/handoff/assign": ["handoff.write"],
  "POST /conversations/:id/handoff/queue": ["handoff.write"],
  "POST /conversations/:id/handoff/escalate": ["handoff.write"],
  "POST /conversations/:id/handoff/return-to-ai": ["handoff.write"],
  "GET /conversations/:id/handoff/ownership": ["handoff.read"],
  "GET /conversations/:id/handoff/history": ["handoff.read"],
  "GET /conversations/:id/handoff/workspace": ["handoff.read"],
  "GET /handoff/queues": ["handoff.read"],
  "GET /handoff/metrics": ["handoff.read"],
  "POST /handoff/presence": ["handoff.write"],
  "GET /leads": ["leads.read"],
  "GET /leads/:id": ["leads.read"],
  "POST /leads": ["leads.write"],
  "PATCH /leads/:id": ["leads.write"],
  "DELETE /leads/:id": ["leads.write"],
  "POST /leads/:id/assign": ["leads.write"],
  "POST /leads/:id/merge": ["leads.write"],
  "POST /leads/:id/convert": ["leads.write"],
  "POST /leads/:id/qualify": ["leads.write"],
  "POST /leads/:id/stage": ["leads.write"],
  "GET /leads/pipelines": ["leads.read"],
  "GET /leads/pipelines/:id/stages": ["leads.read"],
  "GET /leads/:id/activities": ["leads.read"],
  "GET /leads/:id/notes": ["leads.read"],
  "POST /leads/:id/notes": ["leads.write"],
  "GET /leads/metrics": ["leads.read"],
  "GET /appointments": ["bookings.read"],
  "GET /appointments/metrics": ["bookings.read"],
  "GET /appointments/availability": ["bookings.read"],
  "GET /appointments/:id": ["bookings.read"],
  "POST /appointments": ["bookings.write"],
  "PATCH /appointments/:id": ["bookings.write"],
  "DELETE /appointments/:id": ["bookings.write"],
  "POST /appointments/:id/cancel": ["bookings.write"],
  "POST /appointments/:id/reschedule": ["bookings.write"],
  "POST /appointments/:id/confirm": ["bookings.write"],
  "POST /appointments/:id/check-in": ["bookings.write"],
  "POST /appointments/:id/complete": ["bookings.write"],
};
