import type { KnowledgeProvider, KnowledgeQueryInput } from "@workspace/retrieval-engine";
import type { ServiceContext } from "@workspace/retrieval-engine";
import { RETRIEVAL_PERMISSIONS } from "@workspace/retrieval-engine";
import { normalizeKnowledgeQuery } from "../utils/query-normalizer.js";

export type KnowledgeSearchInput = KnowledgeQueryInput & {
  actorUserId?: string;
};

export type KnowledgeAccessContext = ServiceContext & {
  actorUserId?: string;
};

export interface MissingEmbeddingQueuePort {
  queuePendingEmbeddings(input: { companyId: string; collectionId?: string }): Promise<void>;
}

export class KnowledgeSearchCoordinator {
  constructor(
    private readonly knowledge: KnowledgeProvider,
    private readonly options?: {
      embeddingQueue?: MissingEmbeddingQueuePort;
    },
  ) {}

  async search(ctx: KnowledgeAccessContext, input: KnowledgeSearchInput) {
    assertKnowledgeAccess(ctx, input.companyId);

    const question = normalizeKnowledgeQuery(input.question);
    if (!question) {
      throw new Error("question is required for knowledge retrieval.");
    }

    const searchMode = input.searchMode ?? "hybrid";
    const result = await this.knowledge.retrieve(ctx, {
      ...input,
      question,
      searchMode,
      rerank: input.rerank ?? true,
    });

    if (result.chunkCount === 0) {
      void this.queueMissingEmbeddings(input.companyId, input.collectionId);
    }

    return result;
  }

  private queueMissingEmbeddings(companyId: string, collectionId?: string): void {
    const queue = this.options?.embeddingQueue;
    if (!queue) return;
    void queue.queuePendingEmbeddings({ companyId, collectionId }).catch(() => undefined);
  }
}

function assertKnowledgeAccess(ctx: KnowledgeAccessContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new Error(`Tenant isolation violation for company ${companyId}.`);
  }
  if (!ctx.hasPermission(RETRIEVAL_PERMISSIONS.execute) && !ctx.hasPermission("knowledge.view")) {
    throw new Error("Permission denied for knowledge retrieval.");
  }
}
