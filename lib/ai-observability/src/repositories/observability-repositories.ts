import type {
  AITraceRecord,
  AITraceSpanRecord,
  AIExecutionAnalyticsRecord,
  AITokenCostRecord,
  CreateExecutionAnalyticsInput,
  CreateSpanInput,
  CreateTokenCostInput,
  CreateTraceInput,
  ListAnalyticsFilter,
  ListCostRecordsFilter,
  ListTracesFilter,
  UpdateSpanInput,
  UpdateTraceInput,
} from "../types.js";

export interface TraceRepository {
  create(input: CreateTraceInput): Promise<AITraceRecord>;
  update(input: UpdateTraceInput): Promise<AITraceRecord>;
  findByTraceId(traceId: string): Promise<AITraceRecord | null>;
  findById(id: string): Promise<AITraceRecord | null>;
  list(filter: ListTracesFilter): Promise<AITraceRecord[]>;
}

export interface TraceSpanRepository {
  create(input: CreateSpanInput): Promise<AITraceSpanRecord>;
  update(input: UpdateSpanInput): Promise<AITraceSpanRecord>;
  findById(id: string): Promise<AITraceSpanRecord | null>;
  listByTraceId(traceId: string): Promise<AITraceSpanRecord[]>;
  listByCorrelationId(correlationId: string): Promise<AITraceSpanRecord[]>;
}

export interface ExecutionAnalyticsRepository {
  create(input: CreateExecutionAnalyticsInput): Promise<AIExecutionAnalyticsRecord>;
  list(filter: ListAnalyticsFilter): Promise<AIExecutionAnalyticsRecord[]>;
}

export interface TokenCostRepository {
  create(input: CreateTokenCostInput): Promise<AITokenCostRecord>;
  list(filter: ListCostRecordsFilter): Promise<AITokenCostRecord[]>;
}
