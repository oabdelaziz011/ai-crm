import type { ChunkingStrategyName } from "./chunk-strategy-registry.js";
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "../constants.js";

export type ChunkingConfig = {
  strategy?: ChunkingStrategyName | "heading_aware";
  maxChunkSize?: number;
  overlap?: number;
};

export function resolveChunkingConfig(configuration: Record<string, unknown> | undefined): {
  strategyName: ChunkingStrategyName | "heading_aware";
  options: { maxChunkSize: number; overlap: number };
} {
  const chunking = (configuration?.chunking ?? configuration?.chunkingConfig ?? {}) as ChunkingConfig;
  return {
    strategyName: (chunking.strategy as ChunkingStrategyName | "heading_aware") ?? "paragraph",
    options: {
      maxChunkSize: chunking.maxChunkSize ?? DEFAULT_CHUNK_SIZE,
      overlap: chunking.overlap ?? DEFAULT_CHUNK_OVERLAP,
    },
  };
}
