import { TICKET_PERMISSIONS } from "../constants.js";
import { TicketNotFoundError } from "../errors.js";
import type { TicketCommentRepository, TicketRepository } from "../repositories/ticket-repository-port.js";
import type { TicketQueryCachePort } from "../cache/ticket-query-cache-port.js";
import { buildTicketQueryCacheKey } from "../cache/ticket-query-cache-port.js";
import { TICKET_QUERY_CACHE_TTL } from "../constants.js";
import type {
  CustomerTicketSnapshot,
  TicketMetricsSnapshot,
  TicketSearchFilters,
  TicketServiceContext,
  TicketSummary,
} from "../types/ticket-types.js";
import { toTicketSummary } from "../types/ticket-types.js";
import { assertTicketCompanyAccess, assertTicketPermission } from "../validators/ticket-guards.js";
import { readLimit, readOffset } from "../validators/ticket-validators.js";

export type TicketQueryServiceDeps = {
  tickets: TicketRepository;
  comments: TicketCommentRepository;
  cache?: TicketQueryCachePort;
};

export class TicketQueryService {
  constructor(private readonly deps: TicketQueryServiceDeps) {}

  async getTicket(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string },
  ): Promise<{ ticket: TicketSummary; comments: Awaited<ReturnType<TicketCommentRepository["listByTicket"]>> }> {
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const ticket = await this.deps.tickets.findById(input.companyId, input.ticketId);
    if (!ticket) throw new TicketNotFoundError(input.ticketId);

    const comments = await this.deps.comments.listByTicket(input.companyId, input.ticketId);
    return { ticket: toTicketSummary(ticket), comments };
  }

  async listCustomerTickets(
    ctx: TicketServiceContext,
    input: { companyId: string; customerId: string; limit?: number },
  ): Promise<{ tickets: TicketSummary[] }> {
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const limit = readLimit(input.limit, 50, 100);
    const cacheKey = buildTicketQueryCacheKey({
      op: "listCustomer",
      companyId: input.companyId,
      customerId: input.customerId,
      limit,
    });
    const cached = await this.readCache<{ tickets: TicketSummary[] }>(cacheKey);
    if (cached) return cached;

    const records = await this.deps.tickets.listByCustomer(input.companyId, input.customerId, limit);
    const result = { tickets: records.map(toTicketSummary) };
    await this.writeCache(cacheKey, result, TICKET_QUERY_CACHE_TTL.list);
    return result;
  }

  async listConversationTickets(
    ctx: TicketServiceContext,
    input: { companyId: string; conversationId: string },
  ): Promise<{ tickets: TicketSummary[] }> {
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const cacheKey = buildTicketQueryCacheKey({
      op: "listConversation",
      companyId: input.companyId,
      conversationId: input.conversationId,
    });
    const cached = await this.readCache<{ tickets: TicketSummary[] }>(cacheKey);
    if (cached) return cached;

    const records = await this.deps.tickets.listByConversation(input.companyId, input.conversationId);
    const result = { tickets: records.map(toTicketSummary) };
    await this.writeCache(cacheKey, result, TICKET_QUERY_CACHE_TTL.list);
    return result;
  }

  async searchTickets(
    ctx: TicketServiceContext,
    filters: Omit<TicketSearchFilters, "limit" | "offset"> & { limit?: number; offset?: number },
  ): Promise<{ tickets: TicketSummary[]; total: number }> {
    assertTicketCompanyAccess(ctx, filters.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const result = await this.deps.tickets.search({
      ...filters,
      limit: readLimit(filters.limit),
      offset: readOffset(filters.offset),
    });
    return {
      tickets: result.tickets.map(toTicketSummary),
      total: result.total,
    };
  }

  async fetchCustomerSnapshot(
    ctx: TicketServiceContext,
    input: { companyId: string; customerId: string },
  ): Promise<CustomerTicketSnapshot> {
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const cacheKey = buildTicketQueryCacheKey({
      op: "customerSnapshot",
      companyId: input.companyId,
      customerId: input.customerId,
    });
    const cached = await this.readCache<CustomerTicketSnapshot>(cacheKey);
    if (cached) return cached;

    const snapshot = await this.deps.tickets.fetchCustomerSnapshot(input.companyId, input.customerId);
    await this.writeCache(cacheKey, snapshot, TICKET_QUERY_CACHE_TTL.customerSnapshot);
    return snapshot;
  }

  async fetchMetrics(
    ctx: TicketServiceContext,
    input: { companyId: string; todayStartIso: string },
  ): Promise<TicketMetricsSnapshot> {
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const cacheKey = buildTicketQueryCacheKey({
      op: "metrics",
      companyId: input.companyId,
      day: input.todayStartIso.slice(0, 10),
    });
    const cached = await this.readCache<TicketMetricsSnapshot>(cacheKey);
    if (cached) return cached;

    const metrics = await this.deps.tickets.fetchMetrics(input.companyId, input.todayStartIso);
    await this.writeCache(cacheKey, metrics, TICKET_QUERY_CACHE_TTL.metrics);
    return metrics;
  }

  async countOpenByCustomer(
    ctx: TicketServiceContext,
    input: { companyId: string; customerId: string },
  ): Promise<number> {
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.view);

    const cacheKey = buildTicketQueryCacheKey({
      op: "openCount",
      companyId: input.companyId,
      customerId: input.customerId,
    });
    const cached = await this.readCache<number>(cacheKey);
    if (cached != null) return cached;

    const count = await this.deps.tickets.countOpenByCustomer(input.companyId, input.customerId);
    await this.writeCache(cacheKey, count, TICKET_QUERY_CACHE_TTL.openCount);
    return count;
  }

  private async readCache<T>(key: string): Promise<T | null> {
    if (!this.deps.cache) return null;
    return this.deps.cache.get<T>(key);
  }

  private async writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (!this.deps.cache) return;
    await this.deps.cache.set(key, value, ttlMs);
  }
}
