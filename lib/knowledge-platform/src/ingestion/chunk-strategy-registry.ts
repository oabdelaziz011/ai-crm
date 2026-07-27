import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "../constants.js";
import type { ChunkDraft } from "../types.js";
import { computeChecksum, estimateTokenCount, normalizeWhitespace } from "../utils/knowledge-utils.js";
import { ParagraphChunkingStrategy, type ChunkingOptions, type ChunkingStrategy } from "./chunking-strategy.js";
import { HeadingAwareChunkingStrategy } from "./heading-aware-chunking.js";

export type ChunkingStrategyName = "fixed_size" | "sentence" | "paragraph" | "sliding_window" | "heading_aware";

export class FixedSizeChunkingStrategy implements ChunkingStrategy {
  chunk(text: string, options?: ChunkingOptions): ChunkDraft[] {
    const maxChunkSize = options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
    const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];
    const chunks: ChunkDraft[] = [];
    for (let start = 0, order = 0; start < normalized.length; start += maxChunkSize - overlap, order += 1) {
      const content = normalized.slice(start, start + maxChunkSize).trim();
      if (!content) continue;
      chunks.push({
        chunkOrder: order,
        content,
        tokenCount: estimateTokenCount(content),
        checksum: computeChecksum(content),
      });
    }
    return chunks;
  }
}

export class SentenceChunkingStrategy implements ChunkingStrategy {
  chunk(text: string, options?: ChunkingOptions): ChunkDraft[] {
    const maxChunkSize = options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
    const sentences = normalizeWhitespace(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks: ChunkDraft[] = [];
    let buffer = "";
    let order = 0;
    for (const sentence of sentences) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      if (candidate.length <= maxChunkSize) {
        buffer = candidate;
        continue;
      }
      if (buffer) {
        chunks.push({
          chunkOrder: order++,
          content: buffer,
          tokenCount: estimateTokenCount(buffer),
          checksum: computeChecksum(buffer),
        });
      }
      buffer = sentence;
    }
    if (buffer) {
      chunks.push({
        chunkOrder: order,
        content: buffer,
        tokenCount: estimateTokenCount(buffer),
        checksum: computeChecksum(buffer),
      });
    }
    return chunks;
  }
}

export class SlidingWindowChunkingStrategy extends FixedSizeChunkingStrategy {}

export class ChunkStrategyRegistry {
  private readonly strategies = new Map<ChunkingStrategyName, ChunkingStrategy>();

  register(name: ChunkingStrategyName, strategy: ChunkingStrategy): this {
    this.strategies.set(name, strategy);
    return this;
  }

  resolve(name: ChunkingStrategyName = "paragraph"): ChunkingStrategy {
    if (name === "heading_aware") {
      return new HeadingAwareChunkingStrategy();
    }
    return this.strategies.get(name) ?? new ParagraphChunkingStrategy();
  }
}

export function createDefaultChunkStrategyRegistry(): ChunkStrategyRegistry {
  const registry = new ChunkStrategyRegistry();
  registry.register("fixed_size", new FixedSizeChunkingStrategy());
  registry.register("sentence", new SentenceChunkingStrategy());
  registry.register("paragraph", new ParagraphChunkingStrategy());
  registry.register("sliding_window", new SlidingWindowChunkingStrategy());
  registry.register("heading_aware", new HeadingAwareChunkingStrategy());
  return registry;
}
