export type KnowledgeCitationDto = {
  citationId: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  articleTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  excerpt: string;
  confidence: number;
  score: number | null;
  rank: number;
};

export type KnowledgeChunkDto = {
  id: string;
  chunkText: string;
  articleTitle: string | null;
  documentTitle: string;
  sectionTitle: string | null;
  sourceId: string;
  confidence: number;
  score: number | null;
  rank: number;
  tokenCount: number;
  citation: KnowledgeCitationDto;
};

export type KnowledgeContextDto = {
  contextText: string;
  chunks: KnowledgeChunkDto[];
  citations: KnowledgeCitationDto[];
  chunkCount: number;
  totalTokens: number;
  confidence: number;
  executionId: string;
  vectorQueryExecutionId: string;
  searchMode: "vector" | "keyword" | "hybrid";
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  policyId: string | null;
  cacheHit: boolean;
};

export type KnowledgeRetrievalSnapshot = {
  executionId: string;
  contextId: string;
  chunkCount: number;
  totalTokens: number;
  confidence: number;
  searchMode: "vector" | "keyword" | "hybrid";
  vectorQueryExecutionId: string;
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  policyId: string | null;
  chunks: Array<{
    content: string;
    metadata: Record<string, unknown>;
  }>;
  citations: KnowledgeCitationDto[];
  contextText: string;
};
