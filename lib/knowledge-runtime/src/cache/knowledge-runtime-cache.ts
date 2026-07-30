import { MemoryPlatformCache } from "@workspace/platform-cache";
import type { KnowledgeContextDto } from "../dto/knowledge-context-dto.js";

export type KnowledgeRuntimeCacheKeyInput = {
  companyId: string;
  collectionId: string;
  question: string;
  policyKey?: string;
};

export class KnowledgeRuntimeCache {
  private readonly cache = new MemoryPlatformCache();
  private readonly ttlSeconds: number;

  constructor(options?: { ttlSeconds?: number }) {
    this.ttlSeconds = options?.ttlSeconds ?? 45;
  }

  buildKey(input: KnowledgeRuntimeCacheKeyInput): string {
    const normalizedQuestion = input.question.trim().toLowerCase().replace(/\s+/g, " ");
    return `knowledge:${input.companyId}:${input.collectionId}:${input.policyKey ?? "default"}:${normalizedQuestion}`;
  }

  async get(key: string): Promise<KnowledgeContextDto | null> {
    return this.cache.get<KnowledgeContextDto>(key);
  }

  async set(key: string, value: KnowledgeContextDto): Promise<void> {
    await this.cache.set(key, value, this.ttlSeconds);
  }

  async invalidate(key: string): Promise<void> {
    await this.cache.delete(key);
  }
}
