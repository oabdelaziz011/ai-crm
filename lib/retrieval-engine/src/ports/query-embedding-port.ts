import type { ServiceContext } from "../types.js";

export type GenerateQueryEmbeddingInput = {
  companyId: string;
  connectionId: string;
  text: string;
  model?: string;
  correlationId?: string;
};

export type GenerateQueryEmbeddingResult = {
  vector: number[];
  dimensions: number;
  providerKey: string;
  model: string;
  mock?: boolean;
};

/** Cross-platform port — delegates to Embedding Platform; no direct provider access. */
export interface QueryEmbeddingPort {
  generateQueryEmbedding(
    ctx: ServiceContext,
    input: GenerateQueryEmbeddingInput,
  ): Promise<GenerateQueryEmbeddingResult>;
}

export class NoopQueryEmbeddingPort implements QueryEmbeddingPort {
  async generateQueryEmbedding(): Promise<GenerateQueryEmbeddingResult> {
    throw new Error("QueryEmbeddingPort is not configured.");
  }
}
