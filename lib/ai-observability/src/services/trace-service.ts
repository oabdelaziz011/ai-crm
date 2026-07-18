import { AI_OBSERVABILITY_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, TraceNotFoundError, TraceSpanNotFoundError } from "../errors.js";
import type { TraceRepository, TraceSpanRepository } from "../repositories/observability-repositories.js";
import type {
  AITraceRecord,
  AITraceSpanRecord,
  CompleteSpanInput,
  CompleteTraceInput,
  FailSpanInput,
  FailTraceInput,
  ListTracesFilter,
  ServiceContext,
  StartSpanInput,
  StartTraceInput,
  TraceContext,
} from "../types.js";
import type { ErrorCatalogService } from "./error-catalog-service.js";
import {
  assertCorrelationConsistency,
  createTraceIdentifiers,
  elapsedMs,
  toTraceContext,
} from "../utils/trace-utils.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_OBSERVABILITY_PERMISSIONS.analyticsManage);
  }
}

export class TraceService {
  private readonly spanStartedAt = new Map<string, number>();

  constructor(
    private readonly traceRepository: TraceRepository,
    private readonly spanRepository: TraceSpanRepository,
    private readonly errorCatalogService: ErrorCatalogService,
  ) {}

  async startTrace(ctx: ServiceContext, input: StartTraceInput): Promise<{ trace: AITraceRecord; context: TraceContext }> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);
    assertCompanyAccess(ctx, input.companyId);

    const identifiers = createTraceIdentifiers(input.correlationId);
    const trace = await this.traceRepository.create({
      companyId: input.companyId,
      conversationId: input.conversationId ?? null,
      correlationId: identifiers.correlationId,
      traceId: identifiers.traceId,
      createdBy: ctx.userId,
    });

    return { trace, context: toTraceContext(trace) };
  }

  async startSpan(ctx: ServiceContext, input: StartSpanInput): Promise<AITraceSpanRecord> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);
    assertCompanyAccess(ctx, input.companyId);

    const trace = await this.traceRepository.findByTraceId(input.traceId);
    if (!trace || trace.company_id !== input.companyId) {
      throw new TraceNotFoundError(input.traceId);
    }

    assertCorrelationConsistency(trace.correlation_id, input.correlationId);

    const span = await this.spanRepository.create({
      companyId: input.companyId,
      traceId: trace.id,
      correlationId: input.correlationId,
      stage: input.stage,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    });

    this.spanStartedAt.set(span.id, Date.now());
    return span;
  }

  async completeSpan(ctx: ServiceContext, input: CompleteSpanInput): Promise<AITraceSpanRecord> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);

    const existing = await this.spanRepository.findById(input.spanId);
    if (!existing) throw new TraceSpanNotFoundError(input.spanId);
    assertCompanyAccess(ctx, existing.company_id);

    const startedAt = this.spanStartedAt.get(input.spanId) ?? Date.now();
    return this.spanRepository.update({
      spanId: input.spanId,
      status: "completed",
      metadata: { ...existing.metadata, ...(input.metadata ?? {}) },
      durationMs: elapsedMs(startedAt),
    });
  }

  async failSpan(ctx: ServiceContext, input: FailSpanInput): Promise<AITraceSpanRecord> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);

    const existing = await this.spanRepository.findById(input.spanId);
    if (!existing) throw new TraceSpanNotFoundError(input.spanId);
    assertCompanyAccess(ctx, existing.company_id);

    const normalized = this.errorCatalogService.normalize(input.error);
    const startedAt = this.spanStartedAt.get(input.spanId) ?? Date.now();

    return this.spanRepository.update({
      spanId: input.spanId,
      status: "failed",
      metadata: { ...existing.metadata, ...(input.metadata ?? {}) },
      errorCode: normalized.code,
      errorMessage: normalized.message,
      durationMs: elapsedMs(startedAt),
    });
  }

  async completeTrace(ctx: ServiceContext, input: CompleteTraceInput): Promise<AITraceRecord> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);

    const trace = await this.traceRepository.findByTraceId(input.traceId);
    if (!trace) throw new TraceNotFoundError(input.traceId);
    assertCompanyAccess(ctx, trace.company_id);

    const startedAt = Date.parse(trace.started_at);
    return this.traceRepository.update({
      traceId: input.traceId,
      status: "completed",
      durationMs: elapsedMs(startedAt),
    });
  }

  async failTrace(ctx: ServiceContext, input: FailTraceInput): Promise<AITraceRecord> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);

    const trace = await this.traceRepository.findByTraceId(input.traceId);
    if (!trace) throw new TraceNotFoundError(input.traceId);
    assertCompanyAccess(ctx, trace.company_id);

    const normalized = this.errorCatalogService.normalize(input.error);
    const startedAt = Date.parse(trace.started_at);

    return this.traceRepository.update({
      traceId: input.traceId,
      status: "failed",
      errorCode: normalized.code,
      errorMessage: normalized.message,
      durationMs: elapsedMs(startedAt),
    });
  }

  async recordProviderSwitch(
    ctx: ServiceContext,
    input: { companyId: string; traceId: string; correlationId: string; fromProvider: string; toProvider: string },
  ): Promise<AITraceSpanRecord> {
    return this.startSpan(ctx, {
      companyId: input.companyId,
      traceId: input.traceId,
      correlationId: input.correlationId,
      stage: "provider",
      metadata: {
        events: ["provider_switched"],
        from_provider: input.fromProvider,
        to_provider: input.toProvider,
      },
    });
  }

  async getTrace(ctx: ServiceContext, traceId: string): Promise<{ trace: AITraceRecord; spans: AITraceSpanRecord[] }> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsView);

    const trace = await this.traceRepository.findByTraceId(traceId);
    if (!trace) throw new TraceNotFoundError(traceId);
    assertCompanyAccess(ctx, trace.company_id);

    const spans = await this.spanRepository.listByTraceId(trace.id);
    return { trace, spans };
  }

  async listTraces(ctx: ServiceContext, filter: ListTracesFilter): Promise<AITraceRecord[]> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsView);
    assertCompanyAccess(ctx, filter.companyId);
    return this.traceRepository.list(filter);
  }

  propagateContext(context: TraceContext): TraceContext {
    return { ...context };
  }
}
