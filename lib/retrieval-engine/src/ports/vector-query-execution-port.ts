import type { ServiceContext } from "../types.js";

export type ExecuteVectorQueryInput = {
  companyId: string;
  connectionId: string;
  collectionId: string;
  queryVector: number[];
  policyId?: string;
  topK?: number;
  minimumScore?: number;
  metadataFilters?: Record<string, unknown>;
  correlationId?: string;
};

export type ExecuteVectorQueryResult = {
  executionId: string;
  correlationId: string | null;
  executionTimeMs: number;
  provider: string;
  collectionId: string;
  policyId: string | null;
  resultCount: number;
};

/** Cross-platform port — delegates to Vector Query Platform; no direct pgvector access. */
export interface VectorQueryExecutionPort {
  executeVectorQuery(ctx: ServiceContext, input: ExecuteVectorQueryInput): Promise<ExecuteVectorQueryResult>;
}

export class NoopVectorQueryExecutionPort implements VectorQueryExecutionPort {
  async executeVectorQuery(): Promise<ExecuteVectorQueryResult> {
    throw new Error("VectorQueryExecutionPort is not configured.");
  }
}
