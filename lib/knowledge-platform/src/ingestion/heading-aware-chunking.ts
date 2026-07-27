import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "../constants.js";
import type { ChunkDraft } from "../types.js";
import { computeChecksum, estimateTokenCount, normalizeWhitespace } from "../utils/knowledge-utils.js";
import type { ChunkingOptions, ChunkingStrategy } from "./chunking-strategy.js";

export class HeadingAwareChunkingStrategy implements ChunkingStrategy {
  chunk(text: string, options?: ChunkingOptions): ChunkDraft[] {
    const maxChunkSize = options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE;
    const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];

    const sections = normalized.split(/\n(?=#{1,6}\s)|\n(?=[A-Z][^\n]{2,60}:?\s*$)/);
    const chunks: ChunkDraft[] = [];
    let chunkOrder = 0;

    for (const section of sections.map((s) => s.trim()).filter(Boolean)) {
      const headingMatch = section.match(/^(#{1,6}\s+.+|[A-Z][^\n]{2,60}:?\s*)/);
      const heading = headingMatch?.[1]?.trim() ?? null;
      const body = heading ? section.slice(heading.length).trim() : section;

      const parts = body.length > maxChunkSize
        ? splitWithOverlap(body, maxChunkSize, overlap)
        : [body || section];

      for (const part of parts) {
        const content = heading ? `${heading}\n${part}`.trim() : part.trim();
        if (!content) continue;
        chunks.push({
          chunkOrder: chunkOrder++,
          content,
          tokenCount: estimateTokenCount(content),
          checksum: computeChecksum(content),
          metadata: {
            chunking_strategy: "heading_aware",
            section_heading: heading,
          },
        });
      }
    }

    if (chunks.length === 0 && normalized) {
      const fallback = normalized.slice(0, maxChunkSize);
      return [{
        chunkOrder: 0,
        content: fallback,
        tokenCount: estimateTokenCount(fallback),
        checksum: computeChecksum(fallback),
        metadata: { chunking_strategy: "heading_aware" },
      }];
    }

    return chunks;
  }
}

function splitWithOverlap(text: string, maxSize: number, overlap: number): string[] {
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += maxSize - overlap) {
    const slice = text.slice(start, start + maxSize).trim();
    if (slice) parts.push(slice);
  }
  return parts;
}
